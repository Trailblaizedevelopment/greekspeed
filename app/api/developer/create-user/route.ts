import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { generateUniqueUsername, generateProfileSlug } from '@/lib/utils/usernameUtils';
import { generateSimplePassword } from '@/lib/utils/passwordGenerator';
import {
  activateShellSpaceIfInactive,
  syncProfileHomeFromPrimaryMembership,
  upsertSpaceMembership,
} from '@/lib/services/spaceMembershipService';
import { findOrCreateSpaceFromSimulationLabel } from '@/lib/services/spaceFromSimulationService';
import { BIO_MAX_LENGTH } from '@/lib/constants/profileConstants';
import { normalizeUsPhoneForStorage } from '@/lib/utils/formatUsPhone';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalPlaceConfirmed } from '@/types/canonicalPlace';
import {
  formatCanonicalPlaceDisplayForApp,
  parseCanonicalPlaceConfirmed,
} from '@/types/canonicalPlace';

function profileRoleToSpaceMembership(profileRole: string): {
  role: string;
  status: 'active' | 'alumni' | 'inactive';
} {
  if (profileRole === 'alumni') {
    return { role: 'alumni', status: 'alumni' };
  }
  return { role: 'active_member', status: 'active' };
}

async function authenticateRequest(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return {
        user,
        supabase: createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!),
      };
    }
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return {
      user,
      supabase: createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!),
    };
  } catch {
    return null;
  }
}

function sanitizeBio(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().slice(0, BIO_MAX_LENGTH);
  return t.length > 0 ? t : null;
}

function sanitizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return normalizeUsPhoneForStorage(raw);
}

function parseOptionalCurrentPlace(
  raw: unknown
): { ok: true; place: CanonicalPlaceConfirmed | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, place: null };
  const parsed = parseCanonicalPlaceConfirmed(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid current_place: use Mapbox-confirmed place from location picker' };
  }
  return { ok: true, place: parsed.data };
}

type AdditionalIconEntry =
  | { space_id: string }
  | { new_space: { name: string; category?: string } };

function parseAdditionalIconMemberships(body: Record<string, unknown>): AdditionalIconEntry[] {
  const raw = body.additional_icon_memberships;
  if (!Array.isArray(raw)) return [];
  const out: AdditionalIconEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.space_id === 'string' && z.string().uuid().safeParse(o.space_id.trim()).success) {
      out.push({ space_id: o.space_id.trim() });
      continue;
    }
    const ns = o.new_space;
    if (ns && typeof ns === 'object' && !Array.isArray(ns)) {
      const n = ns as Record<string, unknown>;
      const name = typeof n.name === 'string' ? n.name.trim() : '';
      if (!name) continue;
      const category = typeof n.category === 'string' && n.category.trim() ? n.category.trim() : undefined;
      out.push({ new_space: { name, category } });
    }
  }
  return out;
}

async function uploadAvatarFromDataUrl(
  service: SupabaseClient,
  userId: string,
  dataUrl: string
): Promise<string | null> {
  const trimmed = dataUrl.trim().replace(/\s/g, '');
  const m = /^data:(image\/(?:jpeg|jpg|png|gif));base64,(.+)$/i.exec(trimmed);
  if (!m) return null;
  let mime = m[1]!.toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > 5 * 1024 * 1024) return null;
  let ext = 'jpg';
  if (mime.includes('png')) ext = 'png';
  if (mime.includes('gif')) ext = 'gif';
  const path = `${userId}-${Date.now()}.${ext}`;
  const { error } = await service.storage.from('user-avatar').upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    console.error('create-user avatar upload:', error.message);
    return null;
  }
  const { data } = service.storage.from('user-avatar').getPublicUrl(path);
  return data.publicUrl;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_developer')
      .eq('id', user.id)
      .single();

    const body = await request.json();
    let {
      email,
      firstName,
      lastName,
      chapter,
      role = 'active_member',
      chapter_role = 'member',
      is_developer = false,
      member_status = 'active',
      governance_chapter_ids = [] as string[],
    } = body;

    const bodyRecord = body as Record<string, unknown>;
    const bio = sanitizeBio(bodyRecord.bio);
    const phone = sanitizePhone(bodyRecord.phone);
    const avatarRaw = bodyRecord.avatar_data_url;
    const avatarDataUrl: string | null = typeof avatarRaw === 'string' ? avatarRaw : null;
    const additionalIconMemberships = parseAdditionalIconMemberships(bodyRecord);
    const currentPlaceParse = parseOptionalCurrentPlace(bodyRecord.current_place);
    if (!currentPlaceParse.ok) {
      return NextResponse.json({ error: currentPlaceParse.error }, { status: 400 });
    }
    const currentPlacePersisted = currentPlaceParse.place;
    const locationLine = currentPlacePersisted
      ? formatCanonicalPlaceDisplayForApp(currentPlacePersisted)
      : null;

    /** Exclusive Space Icon on the home membership (when home is a space UUID). */
    const is_space_icon_requested = body.is_space_icon === true;

    const isDeveloper = profile?.is_developer === true;

    const trimmedChapter = typeof chapter === 'string' ? chapter.trim() : '';
    const newSpaceRaw = body.newSpace;
    const newSpacePayload =
      newSpaceRaw &&
      typeof newSpaceRaw === 'object' &&
      !Array.isArray(newSpaceRaw) &&
      typeof (newSpaceRaw as { name?: unknown }).name === 'string'
        ? {
            name: String((newSpaceRaw as { name: string }).name).trim(),
            category:
              typeof (newSpaceRaw as { category?: unknown }).category === 'string'
                ? String((newSpaceRaw as { category: string }).category).trim() || undefined
                : undefined,
          }
        : null;

    // Validate required fields (chapter optional for developers except governance / space-icon paths)
    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Email, firstName, and lastName are required' },
        { status: 400 }
      );
    }

    if (!isDeveloper && !trimmedChapter) {
      return NextResponse.json({ error: 'Chapter is required' }, { status: 400 });
    }

    if (isDeveloper && role === 'governance' && !trimmedChapter) {
      return NextResponse.json(
        { error: 'Chapter is required for governance users' },
        { status: 400 }
      );
    }

    if (is_space_icon_requested) {
      const hasNewSpaceName = !!(newSpacePayload && newSpacePayload.name.length > 0);
      const hasExistingUuid =
        !!trimmedChapter && z.string().uuid().safeParse(trimmedChapter).success;
      if (hasNewSpaceName && hasExistingUuid) {
        return NextResponse.json(
          { error: 'Provide either an existing home space or a new home space name for Space Icon, not both' },
          { status: 400 }
        );
      }
      if (!hasNewSpaceName && !hasExistingUuid) {
        return NextResponse.json(
          {
            error:
              'Space Icon on home requires either a selected existing home space or a new home space name',
          },
          { status: 400 }
        );
      }
    }

    // Only developers can assign governance role or is_developer flag
    if (role === 'governance' || is_developer) {
      if (!isDeveloper) {
        return NextResponse.json(
          { error: 'Only developers can assign governance roles or developer access' },
          { status: 403 }
        );
      }
    }

    const governanceChapterIds = Array.isArray(governance_chapter_ids)
      ? governance_chapter_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    // Role validation (admin, active_member, alumni, governance for developer tooling)
    if (!['admin', 'active_member', 'alumni', 'governance'].includes(role)) {
      return NextResponse.json({ 
        error: 'Invalid role. Only admin, active_member, alumni, or governance are allowed.' 
      }, { status: 400 });
    }

    // Sanitize free-text chapter_role
    const sanitizeTitle = (s: string) =>
      s
        .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50);

    if (typeof chapter_role === 'string') {
      chapter_role = sanitizeTitle(chapter_role || 'member') || 'member';
    }

    // Resolve home space: optional for developers (except governance / space-icon rules above).
    let chapterName: string | null = null;
    let chapterId: string | null = null;

    if (is_space_icon_requested && newSpacePayload?.name) {
      const created = await findOrCreateSpaceFromSimulationLabel(supabase, {
        rawName: newSpacePayload.name,
        category: newSpacePayload.category,
        source: 'api_developer_create_user',
      });
      if (!created.ok) {
        return NextResponse.json({ error: created.error }, { status: 400 });
      }
      chapterId = created.id;
      const { data: spRow } = await supabase.from('spaces').select('name').eq('id', chapterId).single();
      chapterName = spRow?.name ?? newSpacePayload.name;
    } else if (trimmedChapter.length === 36 && trimmedChapter.includes('-')) {
      const { data: chapterData, error: chapterError } = await supabase
        .from('spaces')
        .select('id, name')
        .eq('id', trimmedChapter)
        .single();

      if (chapterError || !chapterData) {
        console.error('❌ Chapter not found:', trimmedChapter);
        return NextResponse.json(
          { error: `Chapter not found: ${trimmedChapter}` },
          { status: 400 }
        );
      }

      chapterName = chapterData.name;
      chapterId = chapterData.id;
    } else if (trimmedChapter) {
      chapterName = trimmedChapter;
      chapterId = trimmedChapter;
    }

    if (additionalIconMemberships.length > 0) {
      const homeUuidOk = chapterId && z.string().uuid().safeParse(String(chapterId)).success;
      if (!homeUuidOk) {
        return NextResponse.json(
          {
            error:
              'Home space must be a valid space (choose an existing space UUID) before adding additional Space Icon spaces.',
          },
          { status: 400 }
        );
      }
    }

    // Generate a secure temporary password
    const tempPassword = generateSimplePassword();
    
    // 1. Create user in Supabase Auth
    const { data: newUserAuth, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        chapter: chapterName ?? '',
        role: role
      }
    });

    if (authError) {
      console.error('❌ Auth user creation error:', authError);
      return NextResponse.json({ 
        error: `Failed to create auth user: ${authError.message}` 
      }, { status: 500 });
    }

    if (!newUserAuth.user) {
      return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 });
    }

    // Generate username and slug
    const username = await generateUniqueUsername(supabase, firstName, lastName, newUserAuth.user.id);
    const profileSlug = generateProfileSlug(username);

    // 2. Create profile in profiles table - Use upsert to handle existing records
    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: newUserAuth.user.id,
        email: email.toLowerCase(),
        full_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        username: username,
        profile_slug: profileSlug,
        chapter: chapterName,
        chapter_id: chapterId,
        role: role,
        chapter_role: chapter_role,
        member_status: member_status,
        is_developer: is_developer,
        bio,
        phone,
        current_place: currentPlacePersisted,
        location: locationLine,
        // REMOVE developer_permissions - column no longer exists
        access_level: is_developer ? 'admin' : 'standard',
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Profile creation error:', profileError);
      
      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, username, profile_slug')
        .eq('id', newUserAuth.user.id)
        .single();
      
      if (existingProfile) {
        // Profile already exists, updating instead
        // Generate username if not exists
        let username = existingProfile.username;
        let profileSlug = existingProfile.profile_slug;
        
        if (!username) {
          username = await generateUniqueUsername(supabase, firstName, lastName, newUserAuth.user.id);
          profileSlug = generateProfileSlug(username);
        }

        // Update existing profile - REMOVE developer_permissions here too
        const { data: updatedProfile, error: updateError } = await supabase
          .from('profiles')
          .update({
            email: email.toLowerCase(),
            full_name: `${firstName} ${lastName}`,
            first_name: firstName,
            last_name: lastName,
            username: username,
            profile_slug: profileSlug,
            chapter: chapterName,
            chapter_id: chapterId,
            role: role,
            chapter_role: chapter_role,
            member_status: member_status,
            is_developer: is_developer,
            bio,
            phone,
            current_place: currentPlacePersisted,
            location: locationLine,
            // REMOVE developer_permissions - column no longer exists
            access_level: is_developer ? 'admin' : 'standard',
            onboarding_completed: true,                        
            onboarding_completed_at: new Date().toISOString(), 
            updated_at: new Date().toISOString()
          })
          .eq('id', newUserAuth.user.id)
          .select()
          .single();
        
        if (updateError) {
          console.error('❌ Profile update failed:', updateError);
          // Rollback: delete the auth user
          await supabase.auth.admin.deleteUser(newUserAuth.user.id);
          return NextResponse.json({ 
            error: `Failed to update existing profile: ${updateError.message}` 
          }, { status: 500 });
        }
        
        // Existing profile updated
      } else {
        // Profile doesn't exist, rollback auth user
        console.error('❌ Profile creation failed and no existing profile found');
        await supabase.auth.admin.deleteUser(newUserAuth.user.id);
        return NextResponse.json({ 
          error: `Failed to create user profile: ${profileError.message}` 
        }, { status: 500 });
      }
    } else {
      // New profile created
    }

    if (avatarDataUrl && avatarDataUrl.length > 64) {
      const uploaded = await uploadAvatarFromDataUrl(supabase, newUserAuth.user.id, avatarDataUrl);
      if (uploaded) {
        const { error: avErr } = await supabase
          .from('profiles')
          .update({ avatar_url: uploaded, updated_at: new Date().toISOString() })
          .eq('id', newUserAuth.user.id);
        if (avErr) {
          console.warn('⚠️ create-user avatar_url update:', avErr.message);
        }
      }
    }

    // If role is governance, insert managed chapters into governance_chapters
    if (role === 'governance' && governanceChapterIds.length > 0) {
      const rows = governanceChapterIds.map((cid) => ({
        user_id: newUserAuth.user.id,
        chapter_id: cid,
      }));
      const { error: gcError } = await supabase.from('governance_chapters').insert(rows);
      if (gcError) {
        console.error('❌ governance_chapters insert error:', gcError);
      }
    }

    // TRA-665: Ensure space_memberships row + optional exclusive icon (when chapter_id is a UUID).
    const spaceIdParsed = z.string().uuid().safeParse(String(chapterId));
    if (spaceIdParsed.success) {
      const spaceUuid = spaceIdParsed.data;
      const { role: membershipRole, status: membershipStatus } = profileRoleToSpaceMembership(role);

      const mem = await upsertSpaceMembership(supabase, {
        userId: newUserAuth.user.id,
        spaceId: spaceUuid,
        role: membershipRole,
        status: membershipStatus,
        isPrimary: true,
        isSpaceIcon: is_space_icon_requested ? true : undefined,
      });

      if (!mem.ok) {
        console.error('❌ create-user upsertSpaceMembership:', mem.error);
        return NextResponse.json(
          {
            error: `User created but space membership failed: ${mem.error ?? 'unknown error'}`,
          },
          { status: 500 }
        );
      }

      const activation = await activateShellSpaceIfInactive(supabase, spaceUuid);
      if (!activation.ok) {
        console.warn('⚠️ create-user activateShellSpaceIfInactive:', activation.error);
      }

      const home = await syncProfileHomeFromPrimaryMembership(supabase, {
        userId: newUserAuth.user.id,
        spaceId: spaceUuid,
      });
      if (!home.ok) {
        console.warn('⚠️ create-user syncProfileHomeFromPrimaryMembership:', home.error);
      }

      if (additionalIconMemberships.length > 0) {
        for (const entry of additionalIconMemberships) {
          let sid: string | null = null;
          if ('space_id' in entry) {
            sid = entry.space_id;
          } else {
            const created = await findOrCreateSpaceFromSimulationLabel(supabase, {
              rawName: entry.new_space.name,
              category: entry.new_space.category,
              source: 'api_developer_create_user_additional_icon',
            });
            if (!created.ok) {
              return NextResponse.json(
                { error: `Additional Space Icon space failed: ${created.error}` },
                { status: 400 }
              );
            }
            sid = created.id;
          }
          if (!sid || sid === spaceUuid) continue;

          const m2 = await upsertSpaceMembership(supabase, {
            userId: newUserAuth.user.id,
            spaceId: sid,
            role: membershipRole,
            status: membershipStatus,
            isPrimary: false,
            isSpaceIcon: true,
          });
          if (!m2.ok) {
            return NextResponse.json(
              {
                error: `User created but an additional space membership failed: ${m2.error ?? 'unknown error'}`,
              },
              { status: 500 }
            );
          }

          const act2 = await activateShellSpaceIfInactive(supabase, sid);
          if (!act2.ok) {
            console.warn('⚠️ create-user activateShellSpaceIfInactive (additional):', act2.error);
          }
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'User created successfully', 
      user: {
        id: newUserAuth.user.id,
        email: newUserAuth.user.email,
        full_name: `${firstName} ${lastName}`,
        chapter: chapterName ?? '',
        role: role,
        location: locationLine ?? '',
      },
      tempPassword: tempPassword,
      instructions: [
        'User account created successfully',
        'Temporary password provided above',
        'User should change password on first login',
        'User will be redirected to profile completion if needed'
      ]
    }, { status: 201 });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}