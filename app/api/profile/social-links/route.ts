import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import {
  validateSocialLinks,
  normalizeSocialUrl,
  isValidPlatform,
} from '@/lib/utils/socialLinkValidation';
import type { SocialLinkFormItem } from '@/types/socialLink';

/**
 * GET /api/profile/social-links
 * Returns social links for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: links, error } = await supabase
      .from('profile_social_links')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching social links:', error);
      return NextResponse.json({ error: 'Failed to fetch social links' }, { status: 500 });
    }

    return NextResponse.json({ links: links || [] });
  } catch (error) {
    console.error('Social links GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/profile/social-links
 * Replaces all social links for the authenticated user atomically.
 * Body: { links: SocialLinkFormItem[] }
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const rawLinks: SocialLinkFormItem[] = body.links || [];

    // Validate platforms
    for (const link of rawLinks) {
      if (!isValidPlatform(link.platform)) {
        return NextResponse.json(
          { error: `Invalid platform: ${link.platform}` },
          { status: 400 }
        );
      }
    }

    // Validate URLs
    const validationErrors = validateSocialLinks(rawLinks);
    if (validationErrors.size > 0) {
      const firstError = validationErrors.entries().next().value;
      return NextResponse.json(
        { error: firstError ? `Link ${firstError[0] + 1}: ${firstError[1]}` : 'Validation failed' },
        { status: 400 }
      );
    }

    // Normalize URLs
    const normalizedLinks = rawLinks.map((link, idx) => ({
      user_id: user.id,
      platform: link.platform,
      url: normalizeSocialUrl(link.url),
      handle: link.handle?.trim() || null,
      label: link.label?.trim() || null,
      sort_order: idx,
      is_visible: link.is_visible ?? true,
    }));

    // Delete existing links for this user, then insert new ones
    const { error: deleteError } = await supabase
      .from('profile_social_links')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting old social links:', deleteError);
      return NextResponse.json({ error: 'Failed to update social links' }, { status: 500 });
    }

    if (normalizedLinks.length > 0) {
      const { error: insertError } = await supabase
        .from('profile_social_links')
        .insert(normalizedLinks);

      if (insertError) {
        console.error('Error inserting social links:', insertError);
        return NextResponse.json({ error: 'Failed to save social links' }, { status: 500 });
      }
    }

    // Re-fetch to return the saved state
    const { data: savedLinks, error: fetchError } = await supabase
      .from('profile_social_links')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    if (fetchError) {
      console.error('Error re-fetching social links:', fetchError);
      return NextResponse.json({ error: 'Links saved but failed to return updated list' }, { status: 500 });
    }

    return NextResponse.json({ links: savedLinks || [] });
  } catch (error) {
    console.error('Social links PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
