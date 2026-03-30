import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStateNameByCode } from '@/lib/usStates'
import { normalizeIndustry } from '@/lib/industryUtils';

// Add this helper function at the top of the file
const getChapterId = async (supabase: any, chapterIdentifier: string): Promise<string | null> => {
  // If it's already a UUID, return it
  if (chapterIdentifier.length === 36 && chapterIdentifier.includes('-')) {
    return chapterIdentifier;
  }
  
  // If it's a name, look it up
  const { data } = await supabase
    .from('chapters')
    .select('id')
    .eq('name', chapterIdentifier)
    .single();
  
  return data?.id || null;
};

/**
 * Helper function to validate field values (same as client-side)
 * Returns false for empty strings and invalid placeholder values
 */
function isValidField(value: any): boolean {
  if (!value) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== "" && 
           trimmed !== "Not specified" && 
           trimmed !== "Not Specified" && 
           trimmed !== "Not provided" && 
           trimmed !== "Not Provided" && 
           trimmed !== "N/A" && 
           trimmed !== "n/a" && 
           trimmed !== "Unknown" &&
           trimmed !== "unknown" && 
           trimmed !== "null" &&
           trimmed !== "undefined" &&
           trimmed !== "Not set" && 
           trimmed !== "Not Set" &&
           trimmed !== "TBD" && 
           trimmed !== "tbd" &&
           trimmed !== "TBA" && 
           trimmed !== "tba";
  }
  if (typeof value === 'number') {
    return !isNaN(value) && value > 0;
  }
  return true;
}

/**
 * Calculate a simple completeness score for sorting (server-side)
 * Higher score = more complete profile
 */
function calculateCompletenessScore(alumni: any): number {
  let score = 0;
  
  // Basic info (30 points)
  if (isValidField(alumni.fullName)) score += 10;
  if (isValidField(alumni.chapter)) score += 8;
  if (isValidField(alumni.graduationYear)) score += 7;
  if (isValidField(alumni.avatar)) score += 5;
  
  // Professional info (30 points)
  if (isValidField(alumni.jobTitle)) score += 12;
  if (isValidField(alumni.company)) score += 10;
  if (isValidField(alumni.industry)) score += 8;
  
  // Contact info (20 points)
  if (isValidField(alumni.email)) score += 10;
  if (isValidField(alumni.phone)) score += 6;
  if (isValidField(alumni.location)) score += 4;
  
  // Social info (15 points)
  if (isValidField(alumni.description) && alumni.description !== `Experienced professional in ${alumni.industry}.`) score += 8;
  if (alumni.mutualConnectionsCount > 0) score += 4;
  if (alumni.tags && alumni.tags.length > 0) score += 3;
  
  // Verification (5 points)
  if (alumni.verified) score += 3;
  if (alumni.hasProfile) score += 2;
  
  return score;
}

/**
 * Calculate mutual connections for all alumni in a single efficient query
 * @param supabase - Supabase client
 * @param viewerId - Current user's ID
 * @param alumniUserIds - Array of alumni user IDs to check mutual connections for
 * @returns Map of alumniUserId -> mutual connections array
 */
async function getMutualConnectionsForAlumni(
  supabase: any,
  viewerId: string,
  alumniUserIds: string[]
): Promise<Map<string, Array<{ id: string; name: string; avatar: string | null }>>> {
  if (!viewerId || alumniUserIds.length === 0) {
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

    // Step 2: Get all accepted connections for all alumni in one query
    // This is much more efficient than N separate queries
    const { data: allAlumniConnections, error: alumniConnectionsError } = await supabase
      .from('connections')
      .select('requester_id, recipient_id')
      .eq('status', 'accepted')
      .or(
        alumniUserIds
          .map((id) => `requester_id.eq.${id},recipient_id.eq.${id}`)
          .join(',')
      );

    if (alumniConnectionsError || !allAlumniConnections) {
      console.error('Error fetching alumni connections:', alumniConnectionsError);
      return new Map();
    }

    // Step 3: Group connections by alumni user ID
    const alumniConnectionsMap = new Map<string, Set<string>>();
    
    for (const conn of allAlumniConnections) {
      const alumniId = alumniUserIds.find(
        (id) => conn.requester_id === id || conn.recipient_id === id
      );
      
      if (alumniId) {
        const otherUserId = conn.requester_id === alumniId 
          ? conn.recipient_id 
          : conn.requester_id;
        
        if (!alumniConnectionsMap.has(alumniId)) {
          alumniConnectionsMap.set(alumniId, new Set());
        }
        alumniConnectionsMap.get(alumniId)!.add(otherUserId);
      }
    }

    // Step 4: Find mutual connections (intersection of viewer's and each alumni's connections)
    const mutualConnectionsMap = new Map<
      string,
      Array<{ id: string; name: string; avatar: string | null }>
    >();

    const mutualConnectionIds = new Set<string>();
    
    for (const [alumniId, alumniConnectionIds] of alumniConnectionsMap.entries()) {
      // Find intersection
      const mutualIds = Array.from(alumniConnectionIds).filter((id) =>
        viewerConnectionIds.has(id)
      );
      
      if (mutualIds.length > 0) {
        mutualConnectionsMap.set(alumniId, []); // Initialize with empty array
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
        for (const [alumniId, alumniConnectionIds] of alumniConnectionsMap.entries()) {
          const mutualIds = Array.from(alumniConnectionIds).filter((id) =>
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
            
            mutualConnectionsMap.set(alumniId, mutualConnections);
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

// Helper function to check if location matches state (handles various formats)
const locationMatchesState = (location: string | null | undefined, stateCode: string): boolean => {
  if (!location || !stateCode) return false;
  
  const stateName = getStateNameByCode(stateCode);
  if (!stateName) return false;
  
  const locationLower = location.toLowerCase().trim();
  const stateCodeLower = stateCode.toLowerCase();
  const stateNameLower = stateName.toLowerCase();
  
  return (
    locationLower.endsWith(`, ${stateCodeLower}`) ||
    locationLower.endsWith(`, ${stateNameLower}`) ||
    locationLower.includes(`, ${stateCodeLower},`) ||
    locationLower.includes(`, ${stateNameLower},`) ||
    locationLower === stateCodeLower ||
    locationLower === stateNameLower
  );
};

export async function GET(request: NextRequest) {
  try {
    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables')
      return NextResponse.json({ 
        error: 'Missing environment variables',
        details: {
          hasUrl: !!supabaseUrl,
          hasServiceKey: !!supabaseServiceKey
        }
      }, { status: 500 })
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get viewer identity for privacy checks
    let viewerId: string | null = null;
    let viewerRole: string | null = null;
    
    try {
      // Try to get viewer from auth header first
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
      
      // Get viewer role if we have a viewer
      if (viewerId) {
        const { data: viewerProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', viewerId)
          .single();
        viewerRole = viewerProfile?.role || null;
      }
    } catch (viewerError) {
      // If we can't get viewer, continue without privacy checks (all data will be shown)
      console.log('Could not determine viewer identity, continuing without privacy checks');
    }
    
    // Get query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const search = searchParams.get('search') || ''
    const industry = searchParams.get('industry') || ''
    const chapter = searchParams.get('chapter') || ''
    const location = searchParams.get('location') || ''
    const graduationYear = searchParams.get('graduationYear') || ''
    const activelyHiring = searchParams.get('activelyHiring') || ''
    const state = searchParams.get('state') || ''

    // Chapter filtering parameter
    const userChapterParam = searchParams.get('userChapter') || ''
    const chapterIdParam = searchParams.get('chapter_id') || '' // Developer "view as" support

    // Resolve chapter: if developer sent a chapter_id UUID, look up the chapter name
    // (the alumni table uses `chapter` name column, not chapter_id)
    let userChapter = userChapterParam;

    if (!userChapter && chapterIdParam) {
      const { data: chapterData, error: chapterError } = await supabase
        .from('chapters')
        .select('name')
        .eq('id', chapterIdParam.trim())
        .single();

      if (chapterError) {
        console.error('Error resolving chapter_id to chapter name:', chapterError);
      }

      if (chapterData?.name) {
        userChapter = chapterData.name;
      }
    }

    // 🔥 KEY CHANGE: Use main branch query structure (alumni → profiles) with activity fields
    let query = supabase
      .from('alumni')
      .select(`
        *,
        profile:profiles!user_id(
          avatar_url,
          last_active_at,
          last_login_at,
          role
        )
      `, { count: 'exact' })

    // Apply filters (same logic as main branch)
    if (search) {
      const searchTerm = search.toLowerCase().trim()
      const searchTerms = searchTerm.split(/\s+/)
      const searchConditions = searchTerms.map(term => 
        `full_name.ilike.%${term}%,company.ilike.%${term}%,job_title.ilike.%${term}%,industry.ilike.%${term}%,chapter.ilike.%${term}%`
      ).join(',')
      
      query = query.or(searchConditions)
    }
    
    if (industry) {
      const normalizedFilterIndustry = normalizeIndustry(industry);

      if (normalizedFilterIndustry) {
        query = query.ilike('industry', `%${normalizedFilterIndustry}%`);
      } else {
        query = query.ilike('industry', `%${industry}%`);
      }
    }
    
    // Handle chapter filtering (same logic as main branch)
    if (userChapter) {
      const chapterId = await getChapterId(supabase, userChapter);
      if (chapterId) {
        let chapterNameQuery = supabase
          .from('alumni')
          .select(`
            *,
            profile:profiles!user_id(
              avatar_url,
              last_active_at,
              last_login_at
            )
          `, { count: 'exact' })
          .eq('chapter', userChapter);
        
        let chapterIdQuery = supabase
          .from('alumni')
          .select(`
            *,
            profile:profiles!user_id(
              avatar_url,
              last_active_at,
              last_login_at
            )
          `, { count: 'exact' })
          .eq('chapter', userChapter);
        
        // Apply all other filters to both queries
        if (search) {
          const searchTerm = search.toLowerCase().trim()
          const searchTerms = searchTerm.split(/\s+/)
          const searchConditions = searchTerms.map(term => 
            `full_name.ilike.%${term}%,company.ilike.%${term}%,job_title.ilike.%${term}%,industry.ilike.%${term}%,chapter.ilike.%${term}%`
          ).join(',')
          
          chapterNameQuery = chapterNameQuery.or(searchConditions);
          chapterIdQuery = chapterIdQuery.or(searchConditions);
        }
        
        if (industry) {
          const normalizedFilterIndustry = normalizeIndustry(industry);
          if (normalizedFilterIndustry) {
            chapterNameQuery = chapterNameQuery.ilike('industry', `%${normalizedFilterIndustry}%`);
            chapterIdQuery = chapterIdQuery.ilike('industry', `%${normalizedFilterIndustry}%`);
          } else {
            chapterNameQuery = chapterNameQuery.ilike('industry', `%${industry}%`);
            chapterIdQuery = chapterIdQuery.ilike('industry', `%${industry}%`);
          }
        }
        
        if (location) {
          chapterNameQuery = chapterNameQuery.eq('location', location);
          chapterIdQuery = chapterIdQuery.eq('location', location);
        }
        
        if (state) {
          // Use a broader database filter (matches any location containing the state)
          const stateName = getStateNameByCode(state);
          if (stateName) {
            // Match locations that contain the state code or name anywhere
            chapterNameQuery = chapterNameQuery.or(`location.ilike.%${state}%,location.ilike.%${stateName}%`);
            chapterIdQuery = chapterIdQuery.or(`location.ilike.%${state}%,location.ilike.%${stateName}%`);
          } else {
            chapterNameQuery = chapterNameQuery.ilike('location', `%${state}%`);
            chapterIdQuery = chapterIdQuery.ilike('location', `%${state}%`);
          }
        }
        
        if (graduationYear && graduationYear !== 'All Years') {
          if (graduationYear === 'older') {
            chapterNameQuery = chapterNameQuery.lte('graduation_year', 2019);
            chapterIdQuery = chapterIdQuery.lte('graduation_year', 2019);
          } else {
            chapterNameQuery = chapterNameQuery.eq('graduation_year', parseInt(graduationYear));
            chapterIdQuery = chapterIdQuery.eq('graduation_year', parseInt(graduationYear));
          }
        }
        
        if (activelyHiring) {
          chapterNameQuery = chapterNameQuery.eq('is_actively_hiring', true);
          chapterIdQuery = chapterIdQuery.eq('is_actively_hiring', true);
        }
        
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        chapterNameQuery = chapterNameQuery
          .order('completeness_score', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);
        chapterIdQuery = chapterIdQuery
          .order('completeness_score', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);
        
        // Execute both queries and combine results (fetch ALL matching records)
        const [chapterNameResult, chapterIdResult] = await Promise.all([
          chapterNameQuery,
          chapterIdQuery
        ]);
        
        // Combine and deduplicate results
        const combinedResults = [
          ...(chapterNameResult.data || []),
          ...(chapterIdResult.data || [])
        ];
        
        // Remove duplicates based on id
        const uniqueResults = combinedResults.filter((alumni, index, self) => 
          index === self.findIndex(a => a.id === alumni.id)
        );
        
        // Calculate total count
        const totalCount = Math.max(chapterNameResult.count || 0, chapterIdResult.count || 0);
        
        // Calculate mutual connections for all alumni if viewer is logged in
        let mutualConnectionsMap = new Map<string, Array<{ id: string; name: string; avatar: string | null }>>();

        if (viewerId && uniqueResults && uniqueResults.length > 0) {
          const alumniUserIds = uniqueResults
            .map((a: any) => a.user_id || a.id)
            .filter((id: string | null) => id && id !== viewerId);
          
          if (alumniUserIds.length > 0) {
            mutualConnectionsMap = await getMutualConnectionsForAlumni(
              supabase,
              viewerId,
              alumniUserIds
            );
          }
        }
        
        // 🔥 KEY CHANGE: Use main branch transformation with activity fields and privacy
        const transformedAlumni = uniqueResults?.map(alumni => {
          const alumniUserId = alumni.user_id || alumni.id;
          const isOwner = viewerId && (viewerId === alumniUserId);
          const isAdmin = viewerRole === 'admin';
          const canSeeEmail = isOwner || isAdmin || (alumni.is_email_public !== false);
          const canSeePhone = isOwner || isAdmin || (alumni.is_phone_public !== false);
          
          // Get mutual connections from our calculated map and transform to match type
          const mutualConnectionsData = mutualConnectionsMap.get(alumniUserId) || [];
          const mutualConnections = mutualConnectionsData.map(mc => ({
            id: mc.id,  // ✅ Add the id field
            name: mc.name,
            avatar: mc.avatar || undefined
          }));
          
          return {
            id: alumniUserId,
            alumniId: alumni.id,
            firstName: alumni.first_name,
            lastName: alumni.last_name,
            fullName: alumni.full_name,
            chapter: alumni.chapter,
            industry: alumni.industry,                    // ✅ Direct from alumni table
            graduationYear: alumni.graduation_year,
            company: alumni.company,                      // ✅ Direct from alumni table
            jobTitle: alumni.job_title,                   // ✅ Direct from alumni table
            email: canSeeEmail ? alumni.email : null,
            phone: canSeePhone ? alumni.phone : null,
            isEmailPublic: alumni.is_email_public !== false,
            isPhonePublic: alumni.is_phone_public !== false,
            location: alumni.location,                    // ✅ Direct from alumni table
            description: alumni.description || `Experienced professional in ${alumni.industry}.`,
            mutualConnections: mutualConnections, // ✅ Use calculated mutual connections
            mutualConnectionsCount: mutualConnections.length, // ✅ Use calculated count
            avatar: alumni.avatar_url || alumni.profile?.avatar_url,
            verified: alumni.verified,
            isActivelyHiring: alumni.is_actively_hiring,  // ✅ Direct from alumni table
            lastContact: alumni.last_contact,
            tags: alumni.tags || [],
            hasProfile: !!alumni.user_id,
            // 🔥 NEW: Activity data from profiles table
            lastActiveAt: alumni.profile?.last_active_at,
            lastLoginAt: alumni.profile?.last_login_at
          };
        }) || [];

        // 🔥 COMMENTED OUT: Client-side sorting - now handled at database level by completeness_score
        // Sorting logic: Active users stacked on top, then completeness-based sorting for all
        // filteredAlumni.sort((a, b) => {
        //   // 1. PRIMARY: Actively online alumni (within 1 minute) go to the very top
        //   const aIsActive = isActivelyOnline(a.lastActiveAt);
        //   const bIsActive = isActivelyOnline(b.lastActiveAt);
        //   
        //   // If one is active and the other isn't, active comes first
        //   if (aIsActive && !bIsActive) return -1;
        //   if (!aIsActive && bIsActive) return 1;
        //   
        //   // 2. SECONDARY: Apply the SAME completeness sorting logic to both active and inactive groups
        //   // This ensures active users are sorted by completeness among themselves,
        //   // and inactive users maintain their completeness-based order
        //   
        //   // Sort by completeness score (higher = better)
        //   const aCompleteness = calculateCompletenessScore(a);
        //   const bCompleteness = calculateCompletenessScore(b);
        //   
        //   if (aCompleteness !== bCompleteness) {
        //     return bCompleteness - aCompleteness; // Higher completeness first
        //   }
        //   
        //   // Completeness tier (avatar > job/company > connections > other info > no info)
        //   const aHasAvatar = !!(a.avatar);
        //   const bHasAvatar = !!(b.avatar);
        //   if (aHasAvatar && !bHasAvatar) return -1;
        //   if (!aHasAvatar && bHasAvatar) return 1;
        //   
        //   const aHasProfessional = !!(isValidField(a.jobTitle) || isValidField(a.company));
        //   const bHasProfessional = !!(isValidField(b.jobTitle) || isValidField(b.company));
        //   if (aHasProfessional && !bHasProfessional) return -1;
        //   if (!aHasProfessional && bHasProfessional) return 1;
        //   
        //   const aHasConnections = (a.mutualConnectionsCount || 0) > 0;
        //   const bHasConnections = (b.mutualConnectionsCount || 0) > 0;
        //   if (aHasConnections && !bHasConnections) return -1;
        //   if (!aHasConnections && bHasConnections) return 1;
        //   
        //   // 3. TERTIARY: Sort by name (alphabetical)
        //   return a.fullName.localeCompare(b.fullName);
        // });

        const totalPages = Math.ceil(totalCount / limit);

        return NextResponse.json({
          alumni: transformedAlumni,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          },
          message: `Retrieved ${transformedAlumni.length} alumni records (page ${page} of ${totalPages})`
        });
      } else {
        query = query.eq('chapter', userChapter);
      }
    } else if (chapter) {
      const chapterId = await getChapterId(supabase, chapter);
      if (chapterId) {
        // Similar logic for selected chapter filter
        let chapterNameQuery = supabase
          .from('alumni')
          .select(`
            *,
            profile:profiles!user_id(
              avatar_url,
              last_active_at,
              last_login_at
            )
          `, { count: 'exact' })
          .eq('chapter', chapter);
        
        let chapterIdQuery = supabase
          .from('alumni')
          .select(`
            *,
            profile:profiles!user_id(
              avatar_url,
              last_active_at,
              last_login_at
            )
          `, { count: 'exact' })
          .eq('chapter', userChapter);
        
        // Apply all other filters to both queries (same logic as above)
        if (search) {
          const searchTerm = search.toLowerCase().trim()
          const searchTerms = searchTerm.split(/\s+/)
          const searchConditions = searchTerms.map(term => 
            `full_name.ilike.%${term}%,company.ilike.%${term}%,job_title.ilike.%${term}%,industry.ilike.%${term}%,chapter.ilike.%${term}%`
          ).join(',')
          
          chapterNameQuery = chapterNameQuery.or(searchConditions);
          chapterIdQuery = chapterIdQuery.or(searchConditions);
        }
        
        if (industry) {
          const normalizedFilterIndustry = normalizeIndustry(industry);
          if (normalizedFilterIndustry) {
            chapterNameQuery = chapterNameQuery.ilike('industry', `%${normalizedFilterIndustry}%`);
            chapterIdQuery = chapterIdQuery.ilike('industry', `%${normalizedFilterIndustry}%`);
          } else {
            chapterNameQuery = chapterNameQuery.ilike('industry', `%${industry}%`);
            chapterIdQuery = chapterIdQuery.ilike('industry', `%${industry}%`);
          }
        }
        
        if (location) {
          chapterNameQuery = chapterNameQuery.eq('location', location);
          chapterIdQuery = chapterIdQuery.eq('location', location);
        }
        
        if (state) {
          // Use a broader database filter (matches any location containing the state)
          const stateName = getStateNameByCode(state);
          if (stateName) {
            chapterNameQuery = chapterNameQuery.or(`location.ilike.%${state}%,location.ilike.%${stateName}%`);
            chapterIdQuery = chapterIdQuery.or(`location.ilike.%${state}%,location.ilike.%${stateName}%`);
          } else {
            chapterNameQuery = chapterNameQuery.ilike('location', `%${state}%`);
            chapterIdQuery = chapterIdQuery.ilike('location', `%${state}%`);
          }
        }
        
        if (graduationYear && graduationYear !== 'All Years') {
          if (graduationYear === 'older') {
            chapterNameQuery = chapterNameQuery.lte('graduation_year', 2019);
            chapterIdQuery = chapterIdQuery.lte('graduation_year', 2019);
          } else {
            chapterNameQuery = chapterNameQuery.eq('graduation_year', parseInt(graduationYear));
            chapterIdQuery = chapterIdQuery.eq('graduation_year', parseInt(graduationYear));
          }
        }
        
        if (activelyHiring) {
          chapterNameQuery = chapterNameQuery.eq('is_actively_hiring', true);
          chapterIdQuery = chapterIdQuery.eq('is_actively_hiring', true);
        }
        
        // Apply pagination to both queries
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        
        chapterNameQuery = chapterNameQuery
          .order('completeness_score', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);
        chapterIdQuery = chapterIdQuery
          .order('completeness_score', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);
        
        const [chapterNameResult, chapterIdResult] = await Promise.all([
          chapterNameQuery,
          chapterIdQuery
        ]);
        
        const combinedResults = [
          ...(chapterNameResult.data || []),
          ...(chapterIdResult.data || [])
        ];
        
        const uniqueResults = combinedResults.filter((alumni, index, self) => 
          index === self.findIndex(a => a.id === alumni.id)
        );
        
        const totalCount = Math.max(chapterNameResult.count || 0, chapterIdResult.count || 0);
        
        // Transform data to match your interface with privacy checks
        const transformedAlumni = uniqueResults?.map(alumni => {
          const alumniUserId = alumni.user_id || alumni.id;
          const isOwner = viewerId && (viewerId === alumniUserId);
          const isAdmin = viewerRole === 'admin';
          const canSeeEmail = isOwner || isAdmin || (alumni.is_email_public !== false);
          const canSeePhone = isOwner || isAdmin || (alumni.is_phone_public !== false);
          
          return {
            id: alumniUserId,
            alumniId: alumni.id,
            firstName: alumni.first_name,
            lastName: alumni.last_name,
            fullName: alumni.full_name,
            chapter: alumni.chapter,
            industry: alumni.industry,
            graduationYear: alumni.graduation_year,
            company: alumni.company,
            jobTitle: alumni.job_title,
            email: canSeeEmail ? alumni.email : null,
            phone: canSeePhone ? alumni.phone : null,
            isEmailPublic: alumni.is_email_public !== false,
            isPhonePublic: alumni.is_phone_public !== false,
            location: alumni.location,
            description: alumni.description || `Experienced professional in ${alumni.industry}.`,
            mutualConnections: Array.isArray(alumni.mutual_connections) ? alumni.mutual_connections : [],
            mutualConnectionsCount: Array.isArray(alumni.mutual_connections) ? alumni.mutual_connections.length : 0,
            avatar: alumni.avatar_url || alumni.profile?.avatar_url,
            verified: alumni.verified,
            isActivelyHiring: alumni.is_actively_hiring,
            lastContact: alumni.last_contact,
            tags: alumni.tags || [],
            hasProfile: !!alumni.user_id,
            // Activity data from profiles table
            lastActiveAt: alumni.profile?.last_active_at,
            lastLoginAt: alumni.profile?.last_login_at
          };
        }) || [];

        // 🔥 COMMENTED OUT: Client-side sorting - now handled at database level by completeness_score
        // Sorting logic: Active users stacked on top, then completeness-based sorting for all
        // filteredAlumni.sort((a, b) => {
        //   // 1. PRIMARY: Actively online alumni (within 1 minute) go to the very top
        //   const aIsActive = isActivelyOnline(a.lastActiveAt);
        //   const bIsActive = isActivelyOnline(b.lastActiveAt);
        //   
        //   // If one is active and the other isn't, active comes first
        //   if (aIsActive && !bIsActive) return -1;
        //   if (!aIsActive && bIsActive) return 1;
        //   
        //   // 2. SECONDARY: Apply the SAME completeness sorting logic to both active and inactive groups
        //   // This ensures active users are sorted by completeness among themselves,
        //   // and inactive users maintain their completeness-based order
        //   
        //   // Sort by completeness score (higher = better)
        //   const aCompleteness = calculateCompletenessScore(a);
        //   const bCompleteness = calculateCompletenessScore(b);
        //   
        //   if (aCompleteness !== bCompleteness) {
        //     return bCompleteness - aCompleteness; // Higher completeness first
        //   }
        //   
        //   // Completeness tier (avatar > job/company > connections > other info > no info)
        //   const aHasAvatar = !!(a.avatar);
        //   const bHasAvatar = !!(b.avatar);
        //   if (aHasAvatar && !bHasAvatar) return -1;
        //   if (!aHasAvatar && bHasAvatar) return 1;
        //   
        //   const aHasProfessional = !!(isValidField(a.jobTitle) || isValidField(a.company));
        //   const bHasProfessional = !!(isValidField(b.jobTitle) || isValidField(b.company));
        //   if (aHasProfessional && !bHasProfessional) return -1
        //   if (!aHasProfessional && bHasProfessional) return 1
        //   
        //   const aHasConnections = (a.mutualConnectionsCount || 0) > 0
        //   const bHasConnections = (b.mutualConnectionsCount || 0) > 0
        //   if (aHasConnections && !bHasConnections) return -1
        //   if (!aHasConnections && bHasConnections) return 1
        //   
        //   // 3. TERTIARY: Sort by name (alphabetical)
        //   return a.fullName.localeCompare(b.fullName)
        // })

        const totalPages = Math.ceil(totalCount / limit);

        return NextResponse.json({
          alumni: transformedAlumni,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          },
          message: `Retrieved ${transformedAlumni.length} alumni records (page ${page} of ${totalPages})`
        });
      } else {
        query = query.eq('chapter', chapter);
      }
    }
    
    if (location) {
      query = query.eq('location', location)
    }

    if (state) {
      // Use a broader database filter (matches any location containing the state)
      const stateName = getStateNameByCode(state);
      if (stateName) {
        query = query.or(`location.ilike.%${state}%,location.ilike.%${stateName}%`);
      } else {
        query = query.ilike('location', `%${state}%`);
      }
    }
    
    if (graduationYear && graduationYear !== 'All Years') {
      if (graduationYear === 'older') {
        query = query.lte('graduation_year', 2019)
      } else {
        query = query.eq('graduation_year', parseInt(graduationYear))
      }
    } 
    
    if (activelyHiring) {
      query = query.eq('is_actively_hiring', true)
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    query = query
      .order('completeness_score', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);
    
    const { data: alumni, error, count } = await query

    if (error) {
      console.error('❌ Supabase error:', error)
      return NextResponse.json({ 
        error: 'Database query failed',
        details: error.message,
        code: error.code
      }, { status: 500 })
    }

    // Calculate mutual connections for all alumni if viewer is logged in
    let mutualConnectionsMap = new Map<string, Array<{ id: string; name: string; avatar: string | null }>>();

    if (viewerId && alumni && alumni.length > 0) {
      const alumniUserIds = alumni
        .map((a: any) => a.user_id || a.id)
        .filter((id: string | null) => id && id !== viewerId);
      
      if (alumniUserIds.length > 0) {
        mutualConnectionsMap = await getMutualConnectionsForAlumni(
          supabase,
          viewerId,
          alumniUserIds
        );
      }
    }

    // 🔥 KEY CHANGE: Use main branch transformation with activity fields and privacy
    const transformedAlumni = alumni?.map((alumni: any) => {
      const alumniUserId = alumni.user_id || alumni.id;
      const isOwner = viewerId && viewerId === alumniUserId;
      const isAdmin = viewerRole === 'admin';
      const canSeeEmail = isOwner || isAdmin || (alumni.is_email_public !== false);
      const canSeePhone = isOwner || isAdmin || (alumni.is_phone_public !== false);
      
      // Get mutual connections from our calculated map and transform to match type
      const mutualConnectionsData = mutualConnectionsMap.get(alumniUserId) || [];
      const mutualConnections = mutualConnectionsData.map(mc => ({
        id: mc.id,
        name: mc.name,
        avatar: mc.avatar || undefined
      }));
      
      return {
        id: alumniUserId,
        alumniId: alumni.id,
        firstName: alumni.first_name,
        lastName: alumni.last_name,
        fullName: alumni.full_name,
        chapter: alumni.chapter,
        industry: alumni.industry,                    // ✅ Direct from alumni table
        graduationYear: alumni.graduation_year,
        company: alumni.company,                      // ✅ Direct from alumni table
        jobTitle: alumni.job_title,                   // ✅ Direct from alumni table
        email: canSeeEmail ? alumni.email : null,
        phone: canSeePhone ? alumni.phone : null,
        isEmailPublic: alumni.is_email_public !== false,
        isPhonePublic: alumni.is_phone_public !== false,
        location: alumni.location,                    // ✅ Direct from alumni table
        description: alumni.description || `Experienced professional in ${alumni.industry}.`,
        mutualConnections: mutualConnections, // ✅ Use calculated mutual connections
        mutualConnectionsCount: mutualConnections.length, // ✅ Use calculated count
        avatar: alumni.avatar_url || alumni.profile?.avatar_url,
        verified: alumni.verified,
        isActivelyHiring: alumni.is_actively_hiring,  // ✅ Direct from alumni table
        lastContact: alumni.last_contact,
        tags: alumni.tags || [],
        hasProfile: !!alumni.user_id,
        // ✅ NEW: Activity data from profiles table
        lastActiveAt: alumni.profile?.last_active_at,
        lastLoginAt: alumni.profile?.last_login_at
      };
    }) || []

    // 🔥 COMMENTED OUT: Client-side sorting - now handled at database level by completeness_score
    // Sorting logic: Active users stacked on top, then completeness-based sorting for all
    // filteredAlumni.sort((a, b) => {
    //   // 1. PRIMARY: Actively online alumni (within 1 minute) go to the very top
    //   const aIsActive = isActivelyOnline(a.lastActiveAt);
    //   const bIsActive = isActivelyOnline(b.lastActiveAt);
    //   
    //   // If one is active and the other isn't, active comes first
    //   if (aIsActive && !bIsActive) return -1;
    //   if (!aIsActive && bIsActive) return 1;
    //   
    //   // 2. SECONDARY: Apply the SAME completeness sorting logic to both active and inactive groups
    //   // This ensures active users are sorted by completeness among themselves,
    //   // and inactive users maintain their completeness-based order
    //   
    //   // Sort by completeness score (higher = better)
    //   const aCompleteness = calculateCompletenessScore(a);
    //   const bCompleteness = calculateCompletenessScore(b);
    //   
    //   if (aCompleteness !== bCompleteness) {
    //     return bCompleteness - aCompleteness; // Higher completeness first
    //   }
    //   
    //   // Completeness tier (avatar > job/company > connections > other info > no info)
    //   const aHasAvatar = !!(a.avatar);
    //   const bHasAvatar = !!(b.avatar);
    //   if (aHasAvatar && !bHasAvatar) return -1;
    //   if (!aHasAvatar && bHasAvatar) return 1;
    //   
    //   const aHasProfessional = !!(isValidField(a.jobTitle) || isValidField(a.company));
    //   const bHasProfessional = !!(isValidField(b.jobTitle) || isValidField(b.company));
    //   if (aHasProfessional && !bHasProfessional) return -1;
    //   if (!aHasProfessional && bHasProfessional) return 1;
    //   
    //   const aHasConnections = (a.mutualConnectionsCount || 0) > 0;
    //   const bHasConnections = (b.mutualConnectionsCount || 0) > 0;
    //   if (aHasConnections && !bHasConnections) return -1;
    //   if (!aHasConnections && bHasConnections) return 1;
    //   
    //   // 3. TERTIARY: Sort by name (alphabetical)
    //   return a.fullName.localeCompare(b.fullName);
    // });

    const totalPages = Math.ceil((count || 0) / limit);

    return NextResponse.json({
      alumni: transformedAlumni,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      message: `Retrieved ${transformedAlumni.length} alumni records (page ${page} of ${totalPages})`
    })

  } catch (error) {
    console.error('API Route error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}