import { NextRequest, NextResponse } from 'next/server';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';
import {
  postgrestIlikeQuotedPattern,
  parseChapterCorePayload,
  resolveChapterDirectoryFields,
  buildSpaceInsertRow,
  buildSpaceUpdateRow,
} from '@/lib/api/developerChapterSpacePayload';
import { activateShellSpaceIfInactive, upsertSpaceMembership } from '@/lib/services/spaceMembershipService';
import {
  uploadChapterLogoFromDataUrl,
  upsertPrimaryLogoBrandingForSpace,
} from '@/lib/services/spaceChapterLogoService';
import { fetchPrimaryLogoUrlByChapterIds } from '@/lib/services/chapterBrandingBatchService';

function buildSearchOrFilter(qRaw: string): string | null {
  const token = postgrestIlikeQuotedPattern(qRaw);
  if (!token) return null;
  return [
    `name.ilike.${token}`,
    `slug.ilike.${token}`,
    `school.ilike.${token}`,
    `university.ilike.${token}`,
    `national_fraternity.ilike.${token}`,
    `chapter_name.ilike.${token}`,
    `description.ilike.${token}`,
  ].join(',');
}

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = (page - 1) * limit;
    const qParam = (searchParams.get('q') || '').trim();
    const orFilter = buildSearchOrFilter(qParam);
    const statusParam = (searchParams.get('status') || 'all').trim().toLowerCase();
    if (statusParam !== 'all' && statusParam !== 'active') {
      return NextResponse.json(
        { error: 'Invalid status filter. Use status=all or status=active.' },
        { status: 400 }
      );
    }

    const spaceTypeParam = (searchParams.get('spaceType') || '').trim();
    if (spaceTypeParam.length > 200) {
      return NextResponse.json({ error: 'spaceType filter is too long' }, { status: 400 });
    }

    let query = auth.service
      .from('spaces')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (statusParam === 'active') {
      query = query.eq('chapter_status', 'active');
    }

    if (spaceTypeParam) {
      query = query.eq('space_type', spaceTypeParam);
    }

    if (orFilter) {
      query = query.or(orFilter);
    }

    const { data: chapters, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching chapters:', error);
      return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
    }

    const total = count || 0;

    const chapterList = chapters ?? [];
    const logoMap = await fetchPrimaryLogoUrlByChapterIds(
      auth.service,
      chapterList.map((c) => String(c.id))
    );
    const chaptersWithLogos = chapterList.map((c) => ({
      ...c,
      primary_logo_url: logoMap.get(String(c.id)) ?? null,
    }));

    return NextResponse.json({
      chapters: chaptersWithLogos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      q: qParam.replace(/%/g, '').replace(/,/g, '').trim().slice(0, 120) || null,
      status: statusParam,
      spaceType: spaceTypeParam || null,
    });
  } catch (error) {
    console.error('Error in chapters API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const parsed = parseChapterCorePayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const resolved = await resolveChapterDirectoryFields(auth.service, parsed.data);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const row = buildSpaceInsertRow(parsed.data, resolved);
    const insertData = {
      ...row,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: newChapter, error } = await auth.service.from('spaces').insert([insertData]).select().single();

    if (error) {
      console.error('Error creating chapter:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create chapter' },
        { status: 500 }
      );
    }

    const spaceId = newChapter.id as string;
    const imageData = parsed.data.space_image_data_url?.trim();
    if (imageData) {
      const logoUrl = await uploadChapterLogoFromDataUrl(auth.service, spaceId, imageData);
      if (logoUrl) {
        const brandRes = await upsertPrimaryLogoBrandingForSpace(auth.service, {
          spaceId,
          logoPublicUrl: logoUrl,
          spaceDisplayName: (newChapter as { name?: string }).name ?? parsed.data.name,
          actorUserId: auth.userId,
        });
        if (!brandRes.ok) {
          console.warn('create chapter: initial branding logo:', brandRes.error);
        }
      }
    }

    const iconUserId = parsed.data.space_icon_user_id;
    if (iconUserId) {
      const membership = await upsertSpaceMembership(auth.service, {
        userId: iconUserId,
        spaceId,
        role: 'active_member',
        status: 'active',
        isPrimary: false,
        isSpaceIcon: true,
      });
      if (!membership.ok) {
        const { error: rollbackErr } = await auth.service.from('spaces').delete().eq('id', newChapter.id as string);
        if (rollbackErr) {
          console.error('Rollback after Space Icon failure:', rollbackErr);
        }
        return NextResponse.json(
          {
            error:
              membership.error ??
              'Failed to assign Space Icon. The space was not saved; fix the user or try again without a Space Icon.',
          },
          { status: 500 }
        );
      }

      const activated = await activateShellSpaceIfInactive(auth.service, newChapter.id as string);
      if (!activated.ok) {
        console.warn('create chapter: activateShellSpaceIfInactive after icon:', activated.error);
      }
    }

    return NextResponse.json({
      success: true,
      chapter: newChapter,
      message: 'Chapter created successfully',
    });
  } catch (error) {
    console.error('Error in create chapter API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    const { error: deleteError } = await auth.service.from('spaces').delete().eq('id', chapterId);

    if (deleteError) {
      console.error('Error deleting chapter:', deleteError);
      return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Chapter deleted successfully',
    });
  } catch (error) {
    console.error('Error in delete chapter API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');
    const body = await request.json();

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    const parsed = parseChapterCorePayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const resolved = await resolveChapterDirectoryFields(auth.service, parsed.data);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const updateData = buildSpaceUpdateRow(parsed.data, resolved);

    const { data: updatedChapter, error } = await auth.service
      .from('spaces')
      .update(updateData)
      .eq('id', chapterId)
      .select()
      .single();

    if (error) {
      console.error('Error updating chapter:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update chapter' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chapter: updatedChapter,
      message: 'Chapter updated successfully',
    });
  } catch (error) {
    console.error('Error in update chapter API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
