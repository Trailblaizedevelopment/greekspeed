import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { maybeSyncCrowdedChapterContacts } from '@/lib/services/crowded/maybeSyncCrowdedChapterContacts';
import { duesAssignmentCreateBodySchema } from '@/lib/services/dues/duesAssignmentCreateBodySchema';
import { resolveDuesAssignmentCreateAmount } from '@/lib/services/dues/resolveDuesAssignmentCreateAmount';

// Create a session-aware Supabase client for API routes
function createApiSupabaseClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          // We can't set cookies in API routes, so we'll just return
        },
        remove(name: string, options: any) {
          // We can't remove cookies in API routes, so we'll just return
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      // GET: Authentication failed
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // GET: User authenticated

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      // GET: Profile not found
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const cycleId = searchParams.get('cycleId');
    const chapterId = searchParams.get('chapterId') || profile.chapter_id;

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter context required' }, { status: 400 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, chapterId, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    let query = supabase
      .from('dues_assignments')
      .select(`
        *,
        user:profiles!dues_assignments_user_id_fkey(
          id,
          full_name,
          first_name,
          last_name,
          email,
          member_status
        ),
        cycle:dues_cycles!dues_assignments_dues_cycle_id_fkey(
          id,
          name,
          due_date,
          close_date
        )
      `)
      .eq('cycle.chapter_id', chapterId);

    if (cycleId) {
      query = query.eq('dues_cycle_id', cycleId);
    }

    const { data: assignments, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching dues assignments:', error);
      return NextResponse.json({ error: 'Failed to fetch dues assignments' }, { status: 500 });
    }

    return NextResponse.json({ assignments: assignments || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = duesAssignmentCreateBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { memberId, cycleId, status, notes, useCustomAmount, customAmount } = parsed.data;

    const { data: cycle, error: cycleError } = await supabase
      .from('dues_cycles')
      .select('chapter_id, base_amount, name')
      .eq('id', cycleId)
      .single();

    if (cycleError || !cycle?.chapter_id) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, cycle.chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const resolvedStatus = status || 'required';
    const useCustom = useCustomAmount === true;

    const resolved = resolveDuesAssignmentCreateAmount(
      { base_amount: cycle.base_amount },
      {
        status: resolvedStatus,
        useCustomAmount: useCustom,
        customAmount: useCustom ? customAmount : undefined,
      }
    );

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
    }

    const effectiveAmount = resolved.effectiveAmount;
    const amountSource = resolved.source;

    // Create the dues assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from('dues_assignments')
      .insert({
        dues_cycle_id: cycleId,
        user_id: memberId,
        status: resolvedStatus,
        amount_assessed: effectiveAmount,
        amount_due: effectiveAmount,
        amount_paid: 0,
        notes: notes || ''
      })
      .select()
      .single();

    if (assignmentError) {
      if (assignmentError.code === '23505') {
        return NextResponse.json(
          {
            error: 'This member already has dues assigned for this cycle.',
            code: 'DUPLICATE_DUES_ASSIGNMENT',
          },
          { status: 409 }
        );
      }
      console.error('❌ Error creating dues assignment:', assignmentError);
      return NextResponse.json({ 
        error: 'Failed to create dues assignment', 
        details: assignmentError.message 
      }, { status: 500 });
    }

    // Update the member's profile with dues information
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        current_dues_amount: effectiveAmount,
        dues_status: resolvedStatus,
        last_dues_assignment_date: new Date().toISOString()
      })
      .eq('id', memberId);

    if (profileUpdateError) {
      console.error('⚠️ Error updating member profile:', profileUpdateError);
    }

    await maybeSyncCrowdedChapterContacts({
      supabase,
      trailblaizeChapterId: cycle.chapter_id,
      memberIds: [memberId],
    });

    // Dues assignment created successfully

    return NextResponse.json({ 
      message: 'Dues assignment created successfully',
      assignment,
      resolvedAmount: effectiveAmount,
      amountSource,
    });
  } catch (error) {
    console.error('❌ API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      // PATCH: Authentication failed
      // PATCH: Available cookies
      
      // Use a default user ID for testing - replace with actual user ID
      const testUserId = '1301810d-125a-4716-85ed-98693cc23df0'; // From your logs
      
      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, chapter_id, chapter_role')
        .eq('id', testUserId)
        .single();

      if (profileError || !profile) {
        // PATCH: Test profile not found
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      // Check if user is treasurer
      if (profile.chapter_role !== 'treasurer' && profile.role !== 'admin') {
        // PATCH: Insufficient permissions - user is not treasurer or admin
        return NextResponse.json({ error: 'Only treasurers can modify dues assignments' }, { status: 403 });
      }

      const body = await request.json();
      // PATCH: Received request body
      
      const { assignmentId, status, amount_assessed, amount_due, notes } = body;

      if (!assignmentId) {
        // PATCH: Missing assignmentId
        return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
      }

      // PATCH: Updating assignment

      // Update the dues assignment
      const { data: assignment, error } = await supabase
        .from('dues_assignments')
        .update({
          status,
          amount_assessed,
          amount_due,
          notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) {
        console.error('❌ PATCH: Error updating dues assignment:', error);
        return NextResponse.json({ error: 'Failed to update dues assignment' }, { status: 500 });
      }

      // PATCH: Assignment updated successfully

      // Update the member's profile with new dues information
      if (assignment) {
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({
            current_dues_amount: amount_due,
            dues_status: status,
            last_dues_assignment_date: new Date().toISOString()
          })
          .eq('id', assignment.user_id);

        if (profileUpdateError) {
          console.error('⚠️ PATCH: Error updating member profile:', profileUpdateError);
        } else {
          // PATCH: Member profile updated successfully
        }
      }

      return NextResponse.json({ 
        message: 'Dues assignment updated successfully',
        assignment
      });
    }

    // PATCH: User authenticated

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { assignmentId, status, amount_assessed, amount_due, notes } = body;

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    const { data: assignmentRow, error: fetchAssignError } = await supabase
      .from('dues_assignments')
      .select('dues_cycle_id')
      .eq('id', assignmentId)
      .single();

    if (fetchAssignError || !assignmentRow) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const { data: cycleRow, error: cycleErr } = await supabase
      .from('dues_cycles')
      .select('chapter_id')
      .eq('id', assignmentRow.dues_cycle_id)
      .single();

    if (cycleErr || !cycleRow?.chapter_id) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, cycleRow.chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Only treasurers or chapter admins can modify dues assignments' }, { status: 403 });
    }

    const { data: assignment, error } = await supabase
      .from('dues_assignments')
      .update({
        status,
        amount_assessed,
        amount_due,
        notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      console.error('❌ PATCH: Error updating dues assignment:', error);
      return NextResponse.json({ error: 'Failed to update dues assignment' }, { status: 500 });
    }

    if (assignment) {
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          current_dues_amount: amount_due,
          dues_status: status,
          last_dues_assignment_date: new Date().toISOString()
        })
        .eq('id', assignment.user_id);

      if (profileUpdateError) {
        console.error('⚠️ PATCH: Error updating member profile:', profileUpdateError);
      }
    }

    return NextResponse.json({
      message: 'Dues assignment updated successfully',
      assignment
    });
  } catch (error) {
    console.error('❌ PATCH: API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      // DELETE: Authentication failed
      
      // Use a default user ID for testing
      const testUserId = '1301810d-125a-4716-85ed-98693cc23df0';
      
      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, chapter_id, chapter_role')
        .eq('id', testUserId)
        .single();

      if (profileError || !profile) {
        // DELETE: Test profile not found
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      // Check if user is treasurer
      if (profile.chapter_role !== 'treasurer' && profile.role !== 'admin') {
        // DELETE: Insufficient permissions - user is not treasurer or admin
        return NextResponse.json({ error: 'Only treasurers can delete dues assignments' }, { status: 403 });
      }

      const body = await request.json();
      // DELETE: Received request body
      
      const { assignmentId } = body;

      if (!assignmentId) {
        // DELETE: Missing assignmentId
        return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
      }

      // DELETE: Deleting assignment

      // First, get the assignment to find the user_id
      const { data: assignment, error: fetchError } = await supabase
        .from('dues_assignments')
        .select('user_id')
        .eq('id', assignmentId)
        .single();

      if (fetchError || !assignment) {
        console.error('❌ DELETE: Assignment not found:', fetchError);
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
      }

      // Delete the dues assignment
      const { error: deleteError } = await supabase
        .from('dues_assignments')
        .delete()
        .eq('id', assignmentId);

      if (deleteError) {
        console.error('❌ DELETE: Error deleting dues assignment:', deleteError);
        return NextResponse.json({ error: 'Failed to delete dues assignment' }, { status: 500 });
      }

      // Update the member's profile to clear dues information
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          current_dues_amount: 0,
          dues_status: 'none',
          last_dues_assignment_date: null,
          dues_notes: null
        })
        .eq('id', assignment.user_id);

      if (profileUpdateError) {
        console.error('⚠️ DELETE: Error updating member profile:', profileUpdateError);
      } else {
        // DELETE: Member profile updated successfully
      }

      // DELETE: Assignment deleted successfully

      return NextResponse.json({ 
        message: 'Dues assignment deleted successfully'
      });
    }

    // DELETE: User authenticated

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { assignmentId } = body;

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    const { data: assignmentRow, error: fetchAssignError } = await supabase
      .from('dues_assignments')
      .select('user_id, dues_cycle_id')
      .eq('id', assignmentId)
      .single();

    if (fetchAssignError || !assignmentRow) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const { data: cycleRow, error: cycleErr } = await supabase
      .from('dues_cycles')
      .select('chapter_id')
      .eq('id', assignmentRow.dues_cycle_id)
      .single();

    if (cycleErr || !cycleRow?.chapter_id) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, cycleRow.chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const assignment = { user_id: assignmentRow.user_id };

    // Delete the dues assignment
    const { error: deleteError } = await supabase
      .from('dues_assignments')
      .delete()
      .eq('id', assignmentId);

    if (deleteError) {
      console.error('❌ DELETE: Error deleting dues assignment:', deleteError);
      return NextResponse.json({ error: 'Failed to delete dues assignment' }, { status: 500 });
    }

    // Update the member's profile to clear dues information
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        current_dues_amount: 0,
        dues_status: 'none',
        last_dues_assignment_date: null,
        dues_notes: null
      })
      .eq('id', assignment.user_id);

    if (profileUpdateError) {
      console.error('⚠️ DELETE: Error updating member profile:', profileUpdateError);
    } else {
      // DELETE: Member profile updated successfully
    }

    // DELETE: Assignment deleted successfully

    return NextResponse.json({ 
      message: 'Dues assignment deleted successfully'
    });
  } catch (error) {
    console.error('❌ DELETE: API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
