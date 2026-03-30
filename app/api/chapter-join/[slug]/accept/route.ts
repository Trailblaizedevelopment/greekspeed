import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { generateUniqueUsername, generateProfileSlug } from '@/lib/utils/usernameUtils';

interface ChapterJoinFormData {
  email: string;
  password: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  sms_consent?: boolean;
  join_role: 'active_member' | 'alumni';
  graduation_year?: number;
  major?: string;
  location?: string;
  industry?: string;
  company?: string;
  job_title?: string;
  linkedin_url?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body: ChapterJoinFormData = await request.json();
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: 'Chapter slug is required' }, { status: 400 });
    }

    const { email, password, full_name, first_name, last_name, join_role } = body;

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (!full_name?.trim() && !first_name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!join_role || !['active_member', 'alumni'].includes(join_role)) {
      return NextResponse.json({ error: 'Valid join role is required (active_member or alumni)' }, { status: 400 });
    }

    if (!body.phone?.trim()) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }
    const phoneDigits = body.phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: 'Phone number must be 10 digits' }, { status: 400 });
    }

    // Look up the chapter by slug
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, name, slug, chapter_status')
      .eq('slug', slug)
      .eq('chapter_status', 'active')
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found or inactive' }, { status: 404 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const effectiveFullName = full_name?.trim() || `${first_name || ''} ${last_name || ''}`.trim();
    const effectiveFirstName = (first_name ?? effectiveFullName.split(' ')[0] ?? '').trim();
    const effectiveLastName = (last_name ?? effectiveFullName.split(' ').slice(1).join(' ') ?? '').trim();
    const nowIso = new Date().toISOString();

    // Create the user account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: effectiveFullName,
          first_name: effectiveFirstName,
          last_name: effectiveLastName,
        }
      }
    });

    if (authError || !authData.user) {
      console.error('Chapter Join Accept: Auth signup error:', authError);
      return NextResponse.json({
        error: authError?.message || 'Failed to create account'
      }, { status: 500 });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const username = await generateUniqueUsername(supabase, effectiveFirstName, effectiveLastName, authData.user.id);
    const profileSlug = generateProfileSlug(username);

    const isAlumni = join_role === 'alumni';
    const profileRole = isAlumni ? 'alumni' : 'active_member';
    const memberStatus = isAlumni ? 'active' : 'active';

    const currentYear = new Date().getFullYear();
    const effectiveGradYear = body.graduation_year || (isAlumni ? currentYear : currentYear + 4);

    let majorString: string | null = null;
    if (body.major) {
      majorString = Array.isArray(body.major)
        ? (body.major as string[]).filter((m: string) => m && m.trim()).join(', ')
        : body.major.trim() || null;
    }
    if (!majorString && !isAlumni) {
      majorString = 'To be updated';
    }

    // Create/upsert profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: normalizedEmail,
        full_name: effectiveFullName,
        first_name: effectiveFirstName,
        last_name: effectiveLastName,
        username,
        profile_slug: profileSlug,
        phone: phoneDigits || null,
        sms_consent: body.sms_consent || false,
        chapter_id: chapter.id,
        chapter: chapter.name,
        role: profileRole,
        member_status: memberStatus,
        grad_year: effectiveGradYear,
        major: majorString,
        location: body.location?.trim() || null,
        onboarding_completed: false,
        created_at: nowIso,
        updated_at: nowIso,
      }, { onConflict: 'id', ignoreDuplicates: false });

    if (profileError) {
      console.error('Chapter Join Accept: Profile creation error:', profileError);
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error('Chapter Join Accept: Failed to clean up auth user:', deleteError);
      }
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    // For alumni, also create the alumni record
    if (isAlumni) {
      const { data: existingAlumni } = await supabase
        .from('alumni')
        .select('description, avatar_url, verified, is_actively_hiring, last_contact, tags, mutual_connections, created_at')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      const alumniPayload = {
        user_id: authData.user.id,
        first_name: effectiveFirstName,
        last_name: effectiveLastName,
        full_name: effectiveFullName,
        chapter: chapter.name,
        chapter_id: chapter.id,
        industry: body.industry?.trim() || 'Not specified',
        graduation_year: effectiveGradYear,
        company: body.company?.trim() || 'Not specified',
        job_title: body.job_title?.trim() || 'Not specified',
        email: normalizedEmail,
        phone: phoneDigits || null,
        location: body.location?.trim() || 'Not specified',
        linkedin_url: body.linkedin_url?.trim() || null,
        description: existingAlumni?.description ?? `Alumni from ${chapter.name}`,
        avatar_url: existingAlumni?.avatar_url ?? null,
        verified: existingAlumni?.verified ?? false,
        is_actively_hiring: existingAlumni?.is_actively_hiring ?? false,
        last_contact: existingAlumni?.last_contact ?? null,
        tags: existingAlumni?.tags ?? null,
        mutual_connections: existingAlumni?.mutual_connections ?? [],
        created_at: existingAlumni?.created_at ?? nowIso,
        updated_at: nowIso,
      };

      const { error: alumniError } = await supabase
        .from('alumni')
        .upsert(alumniPayload, { onConflict: 'user_id' });

      if (alumniError) {
        console.error('Chapter Join Accept: Alumni record upsert error:', alumniError);
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('Chapter Join Accept: Failed to clean up auth user:', deleteError);
        }
        return NextResponse.json({ error: 'Failed to store alumni profile' }, { status: 500 });
      }
    }

    // Sign in the user
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      console.error('Chapter Join Accept: Auto sign-in failed:', signInError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name: effectiveFullName,
        chapter_id: chapter.id,
        chapter: chapter.name,
        role: profileRole,
        member_status: memberStatus,
        needs_approval: false,
      }
    });
  } catch (error) {
    console.error('Chapter Join Accept: API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
