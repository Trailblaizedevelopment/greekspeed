import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Calculate mutual connections for all members in a single efficient query
 * @param supabase - Supabase client
 * @param viewerId - Current user's ID
 * @param memberUserIds - Array of member user IDs to check mutual connections for
 * @returns Map of memberUserId -> mutual connections array
 */
async function getMutualConnectionsForMembers(
  supabase: any,
  viewerId: string,
  memberUserIds: string[]
): Promise<Map<string, Array<{ id: string; name: string; avatar: string | null }>>> {
  if (!viewerId || memberUserIds.length === 0) {
    return new Map();
  }

  try {
    // Step 1: Get viewer's accepted connections (single query)
    const { data: viewerConnections, error: viewerError } = await supabase
      .from('connections')
      .select('requester_id, recipient_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`);

    if (viewerError || !viewerConnections) {
      console.error('Error fetching viewer connections:', viewerError);
      return new Map();
    }

    // Extract viewer's connection IDs
    const viewerConnectionIds = new Set(
      viewerConnections.map((conn: any) =>
        conn.requester_id === viewerId ? conn.recipient_id : conn.requester_id
      )
    );

    if (viewerConnectionIds.size === 0) {
      return new Map(); // No connections, so no mutual connections
    }

    // Step 2: Get all accepted connections for all members via RPC (avoids URL length limit)
    const { data: allMemberConnections, error: memberConnectionsError } = await supabase
      .rpc('get_connections_for_member_ids', { member_ids: memberUserIds });

    if (memberConnectionsError || !allMemberConnections) {
      console.error('Error fetching member connections:', memberConnectionsError);
      return new Map();
    }

    // Step 3: Group connections by member user ID
    const memberConnectionsMap = new Map<string, Set<string>>();
    
    for (const conn of allMemberConnections) {
      const memberId = memberUserIds.find(
        (id) => conn.requester_id === id || conn.recipient_id === id
      );
      
      if (memberId) {
        const otherUserId = conn.requester_id === memberId 
          ? conn.recipient_id 
          : conn.requester_id;
        
        if (!memberConnectionsMap.has(memberId)) {
          memberConnectionsMap.set(memberId, new Set());
        }
        memberConnectionsMap.get(memberId)!.add(otherUserId);
      }
    }

    // Step 4: Find mutual connections (intersection of viewer's and each member's connections)
    const mutualConnectionsMap = new Map<
      string,
      Array<{ id: string; name: string; avatar: string | null }>
    >();

    const mutualConnectionIds = new Set<string>();
    
    for (const [memberId, memberConnectionIds] of memberConnectionsMap.entries()) {
      // Find intersection
      const mutualIds = Array.from(memberConnectionIds).filter((id) =>
        viewerConnectionIds.has(id)
      );
      
      if (mutualIds.length > 0) {
        mutualConnectionsMap.set(memberId, []); // Initialize with empty array
        mutualIds.forEach((id) => mutualConnectionIds.add(id));
      }
    }

    // Step 5: Fetch profile details for all mutual connections in one query
    if (mutualConnectionIds.size > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, avatar_url')
        .in('id', Array.from(mutualConnectionIds));

      if (!profilesError && profiles) {
        const profilesMap = new Map(
          profiles.map((profile: any) => [
            profile.id,
            {
              id: profile.id,
              name:
                profile.full_name ||
                `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
              avatar: profile.avatar_url,
            },
          ])
        );

        // Step 6: Build final mutual connections map
        for (const [memberId, memberConnectionIds] of memberConnectionsMap.entries()) {
          const mutualIds = Array.from(memberConnectionIds).filter((id) =>
            viewerConnectionIds.has(id)
          );
          
          if (mutualIds.length > 0) {
            const mutualConnections = mutualIds
              .map((id) => profilesMap.get(id))
              .filter((profile) => profile !== undefined) as Array<{
              id: string;
              name: string;
              avatar: string | null;
            }>;
            
            mutualConnectionsMap.set(memberId, mutualConnections);
          }
        }
      }
    }

    return mutualConnectionsMap;
  } catch (error) {
    console.error('Error calculating mutual connections:', error);
    return new Map();
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');
    const excludeAlumni = searchParams.get('exclude_alumni') === 'true';

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID required' }, { status: 400 });
    }

    // Get viewer ID for mutual connections
    let viewerId: string | null = null;
    try {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (!authError && user) {
          viewerId = user.id;
        }
      }
      
      // If no viewer from header, try cookies (for SSR requests)
      if (!viewerId) {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const { createServerClient } = await import('@supabase/ssr');
        
        const anonClient = createServerClient(
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
        
        const { data: { user } } = await anonClient.auth.getUser();
        if (user) {
          viewerId = user.id;
        }
      }
    } catch (e) {
      // Continue without viewer ID
      console.log('Could not determine viewer identity for chapter members');
    }

    // Chapter members: same shape as former chapter_members_view (profiles + chapter metadata)
    const profileColumns =
      'id, email, full_name, first_name, last_name, chapter, role, chapter_role, member_status, pledge_class, grad_year, major, minor, gpa, hometown, bio, phone, location, avatar_url, created_at, updated_at, chapter_id';

    let query = supabase
      .from('profiles')
      .select(
        `
        ${profileColumns},
        spaces!left (
          id,
          name,
          description,
          location,
          university,
          slug,
          founded_year
        )
      `
      )
      .eq('chapter_id', chapterId);

    if (excludeAlumni) {
      query = query.neq('role', 'alumni');
    }

    const { data: memberRows, error } = await query.order('created_at', { ascending: false });

    const members =
      memberRows?.map((row: Record<string, unknown>) => {
        const ch = row.spaces as
          | {
              id: string;
              name: string | null;
              description: string | null;
              location: string | null;
              university: string | null;
              slug: string | null;
              founded_year: number | null;
            }
          | null
          | undefined;
        const { spaces: _nested, ...profile } = row;
        const chapterIdResolved = (ch?.id as string | undefined) ?? (profile.chapter_id as string | undefined);
        return {
          ...profile,
          chapter_id: chapterIdResolved,
          chapter_name: ch?.name ?? null,
          chapter_description: ch?.description ?? null,
          chapter_location: ch?.location ?? null,
          chapter_university: ch?.university ?? null,
          chapter_slug: ch?.slug ?? null,
          chapter_founded_year: ch?.founded_year ?? null,
        };
      }) ?? null;

    if (error) {
      console.error('Error fetching chapter members:', error);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    // Filter out developers by checking profiles table
    let filteredMembers = members ?? [];
    if (members && members.length > 0) {
      const memberIds = members.map((m: any) => m.id).filter(Boolean);
      
      // Get is_developer status for all members
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, is_developer')
        .in('id', memberIds);
      
      if (!profilesError && profiles) {
        // Create a set of developer IDs to exclude
        const developerIds = new Set(
          profiles
            .filter((p: any) => p.is_developer === true)
            .map((p: any) => p.id)
        );
        
        // Filter out developers from members
        filteredMembers = members.filter((m: any) => !developerIds.has(m.id));
      }
    }

    // Calculate mutual connections if viewer is logged in
    let mutualConnectionsMap = new Map<string, Array<{ id: string; name: string; avatar: string | null }>>();

    if (viewerId && filteredMembers && filteredMembers.length > 0) {
      const memberUserIds = filteredMembers
        .map((m: any) => m.id)
        .filter((id: string | null) => id && id !== viewerId);
      
      if (memberUserIds.length > 0) {
        mutualConnectionsMap = await getMutualConnectionsForMembers(
          supabase,
          viewerId,
          memberUserIds
        );
      }
    }

    // Fetch last_active_at from profiles table if not in view
    // Get all member IDs to fetch activity data
    const memberIds = filteredMembers.map((m: any) => m.id).filter(Boolean);
    let lastActiveMap = new Map<string, string | null>();
    
    if (memberIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, last_active_at')
        .in('id', memberIds);
      
      if (!profilesError && profiles) {
        profiles.forEach((profile: any) => {
          lastActiveMap.set(profile.id, profile.last_active_at);
        });
      }
    }

    // Transform members with mutual connections and lastActiveAt
    const transformedMembers = filteredMembers.map((member: any) => {
      const mutualConnections = mutualConnectionsMap.get(member.id) || [];
      
      return {
        ...member,
        mutualConnections: mutualConnections.map(mc => ({
          id: mc.id,
          name: mc.name,
          avatar: mc.avatar || undefined
        })),
        mutualConnectionsCount: mutualConnections.length,
        lastActiveAt: lastActiveMap.get(member.id) || member.last_active_at || null
      };
    });

    return NextResponse.json({ members: transformedMembers });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

