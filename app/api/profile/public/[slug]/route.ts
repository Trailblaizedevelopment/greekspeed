import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { fetchUserProfileBySlug } from '@/lib/services/userProfileService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    // Fetch profile by slug
    const profile = await fetchUserProfileBySlug(slug);
    
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Fetch connection count and event RSVPs using service role
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [connectionCountResult, eventRsvpsResult] = await Promise.all([
      supabaseService
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .or(`requester_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
        .eq('status', 'accepted'),
      supabaseService
        .from('event_rsvps')
        .select('event_id, events!inner(id, title, start_time, location, status)')
        .eq('user_id', profile.id)
        .in('status', ['attending', 'going'])
        .gte('events.start_time', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const connectionCount = connectionCountResult.count ?? 0;
    const userEventRsvps = (eventRsvpsResult.data || [])
      .map((r: Record<string, unknown>) => r.events as { id: string; title: string; start_time: string; location?: string; status?: string } | null)
      .filter(Boolean)
      .filter((e) => e!.status !== 'cancelled');

    // Try to get viewer (optional authentication)
    let viewerId: string | null = null;
    let isOwnProfile = false;
    let connectionStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'declined' | 'blocked' = 'none';
    let connectionId: string | null = null;
    let sharedChapter: string | null = null;

    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
            set() {},
            remove() {},
          },
        }
      );

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        viewerId = user.id;
        isOwnProfile = viewerId === profile.id;

        // Get connection status if not own profile
        if (!isOwnProfile) {
          const { data: connections } = await supabaseService
            .from('connections')
            .select('id, status, requester_id, recipient_id')
            .or(`and(requester_id.eq.${viewerId},recipient_id.eq.${profile.id}),and(requester_id.eq.${profile.id},recipient_id.eq.${viewerId})`)
            .maybeSingle();

          if (connections) {
            connectionId = connections.id;
            if (connections.status === 'pending') {
              connectionStatus = connections.requester_id === viewerId ? 'pending_sent' : 'pending_received';
            } else {
              connectionStatus = connections.status as 'accepted' | 'declined' | 'blocked';
            }
          }

          // Check shared chapter
          if (profile.chapter_id) {
            const { data: viewerProfile } = await supabaseService
              .from('profiles')
              .select('chapter_id')
              .eq('id', viewerId)
              .single();

            if (viewerProfile?.chapter_id === profile.chapter_id) {
              sharedChapter = profile.chapter || null;
            }
          }
        }
      }
    } catch (authError) {
      // Viewer authentication failed - continue without viewer
      console.log('Could not authenticate viewer, continuing as public request');
    }

    // Determine what data viewer can see
    const canSeeFullProfile = isOwnProfile || connectionStatus === 'accepted';
    const canConnect = !isOwnProfile && !viewerId || (viewerId && connectionStatus === 'none');
    const canMessage = isOwnProfile || connectionStatus === 'accepted';

    // Filter profile data based on privacy and connection status
    let filteredProfile = { ...profile };

    // Hide email if not own profile and not connected
    if (!canSeeFullProfile) {
      // Check privacy settings
      if (profile.type === 'alumni' && profile.alumni) {
        if (!profile.alumni.is_email_public) {
          filteredProfile.email = null;
        }
        if (!profile.alumni.is_phone_public) {
          filteredProfile.phone = null;
        }
      } else {
        // For regular users, hide email/phone from non-connected viewers
        filteredProfile.email = null;
        filteredProfile.phone = null;
      }
    }

    // Determine visibility flags
    const emailVisible = canSeeFullProfile || (profile.type === 'alumni' && profile.alumni?.is_email_public);
    const phoneVisible = canSeeFullProfile || (profile.type === 'alumni' && profile.alumni?.is_phone_public);
    const locationVisible = canSeeFullProfile;

    return NextResponse.json({
      profile: filteredProfile,
      viewer: {
        id: viewerId,
        isOwnProfile,
        connectionStatus,
        connectionId,
        canConnect,
        canMessage,
        canSeeFullProfile,
      },
      privacy: {
        emailVisible,
        phoneVisible,
        locationVisible,
      },
      enrichment: {
        connectionCount,
        sharedChapter,
        eventRsvps: userEventRsvps,
      },
    });
  } catch (error) {
    console.error('Public profile API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

