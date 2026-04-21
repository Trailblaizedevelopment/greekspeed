import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { canSendEmailNotification } from '@/lib/utils/checkEmailPreferences';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');
    const visibleToActive =
      searchParams.get('visible_to_active_members') === 'false' ? false : true;
    const visibleToAlumni =
      searchParams.get('visible_to_alumni') === 'false' ? false : true;

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID required' }, { status: 400 });
    }

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    // Get all active members and admins
    const { data: members, error: membersError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        phone,
        sms_consent
      `)
      .eq('chapter_id', chapterId)
      .in('role', ['active_member', 'admin']);

    if (membersError || !members) {
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    // Count email recipients (has email AND email_enabled AND event_notifications)
    let emailCount = 0;
    if (visibleToActive) {
      for (const member of members) {
        if (member.email) {
          try {
            const allowed = await canSendEmailNotification(member.id, 'event');
            if (allowed) emailCount++;
          } catch {
            // Skip on error
          }
        }
      }
    }

    // Count SMS recipients (has phone AND sms_consent = true)
    const smsCount = visibleToActive
      ? members.filter(member => 
          member.phone && 
          member.phone.trim() !== '' && 
          member.sms_consent === true
        ).length
      : 0;

    // Get alumni in the same chapter
    const { data: alumni, error: alumniError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        phone,
        sms_consent
      `)
      .eq('chapter_id', chapterId)
      .eq('role', 'alumni');

    if (alumniError || !alumni) {
      return NextResponse.json({ error: 'Failed to fetch alumni' }, { status: 500 });
    }

    // Count alumni email recipients using same preference logic
    let alumniEmailCount = 0;
    if (visibleToAlumni) {
      for (const alum of alumni) {
        if (alum.email) {
          try {
            const allowed = await canSendEmailNotification(alum.id, 'event');
            if (allowed) alumniEmailCount++;
          } catch {
            // Skip on error
          }
        }
      }
    }

    // Count alumni SMS recipients (has phone AND sms_consent = true)
    const alumniSmsCount = visibleToAlumni
      ? alumni.filter(alum => 
          alum.phone && 
          alum.phone.trim() !== '' && 
          alum.sms_consent === true
        ).length
      : 0;

    return NextResponse.json({
      email_recipients: emailCount,
      sms_recipients: smsCount,
      total_members: members.length,
      alumni_email_recipients: alumniEmailCount,
      alumni_sms_recipients: alumniSmsCount,
      total_alumni: alumni.length
    });
  } catch (error) {
    console.error('Error getting recipient counts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}