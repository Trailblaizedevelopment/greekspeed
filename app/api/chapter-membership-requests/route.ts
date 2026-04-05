import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createPendingMembershipRequest,
  listPendingMembershipRequestsForChapter,
} from '@/lib/services/membershipRequestService';
import { authenticateAdminForChapterMembership } from '@/lib/api/chapterMembershipRequestsAdminAuth';
import {
  createMarketingMembershipRequestBodySchema,
  listPendingMembershipRequestsQuerySchema,
} from '@/lib/validation/chapterMembershipRequests';

/**
 * GET — pending membership requests for a chapter (admin / exec / governance / platform admin).
 * TRA-573: `canManageMembersForContext` + optional governance managed chapters.
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const queryObject = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listPendingMembershipRequestsQuerySchema.safeParse(queryObject);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join('; ');
      return NextResponse.json({ error: message || 'Invalid query' }, { status: 400 });
    }

    const { chapterId } = parsed.data;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const auth = await authenticateAdminForChapterMembership(
      request,
      chapterId,
      supabase
    );
    if (!auth.ok) {
      return auth.response;
    }

    const data = await listPendingMembershipRequestsForChapter(supabase, chapterId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET /api/chapter-membership-requests:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST — queue a chapter join request for users who signed up via marketing alumni flow.
 * TRA-572: requires profiles.signup_channel === 'marketing_alumni'; dedupe via service + DB partial unique index.
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = createMarketingMembershipRequestBodySchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join('; ');
      return NextResponse.json({ error: message || 'Invalid request body' }, { status: 400 });
    }

    const { chapterId } = parsed.data;

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, signup_channel, is_developer')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // TRA-585: Developers may create test requests without marketing_alumni signup_channel.
    if (profile.signup_channel !== 'marketing_alumni' && profile.is_developer !== true) {
      return NextResponse.json(
        {
          error:
            'Membership requests through this endpoint are only available for marketing alumni sign-up',
        },
        { status: 403 }
      );
    }

    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .eq('chapter_status', 'active')
      .maybeSingle();

    if (chapterError || !chapter) {
      return NextResponse.json(
        { error: 'Chapter not found or inactive' },
        { status: 404 }
      );
    }

    const result = await createPendingMembershipRequest(supabase, {
      userId: user.id,
      chapterId,
      source: 'marketing_alumni',
    });

    if (!result.ok) {
      switch (result.code) {
        case 'NOT_FOUND':
          return NextResponse.json({ error: result.message }, { status: 404 });
        case 'ALREADY_MEMBER':
        case 'WRONG_CHAPTER':
          return NextResponse.json({ error: result.message }, { status: 409 });
        case 'DUPLICATE_PENDING':
        case 'INVALID_STATE':
          return NextResponse.json({ error: result.message }, { status: 400 });
        default:
          return NextResponse.json({ error: result.message }, { status: 500 });
      }
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/chapter-membership-requests:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
