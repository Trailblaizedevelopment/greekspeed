import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { normalizeIndustry } from '@/lib/industryUtils';
import { US_STATES } from '@/lib/usStates';
import type { AlumniIntelligence } from '@/types/governance';

/**
 * GET /api/governance/alumni-intelligence
 *
 * Returns industry and geographic aggregates for alumni across the caller's
 * managed chapters.
 *
 * Query params:
 *   chapterIds — comma-separated list of chapter UUIDs to filter by.
 *                Must be a subset of the caller's managed chapters.
 *                Omit to include all managed chapters.
 *
 * Authorization:
 *   - Requires Bearer token in Authorization header.
 *   - Caller must have `role === 'governance'`.
 *   - Requested chapterIds that are NOT in the caller's managed set are
 *     silently ignored (intersection approach). This avoids leaking info
 *     about chapters the caller cannot access.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.role !== 'governance') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const managedIds = await getManagedChapterIds(supabase, user.id);

    const { searchParams } = new URL(request.url);
    const chapterIdsParam = searchParams.get('chapterIds');

    let targetChapterIds: string[];
    if (chapterIdsParam) {
      const requested = chapterIdsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const managedSet = new Set(managedIds);
      targetChapterIds = requested.filter((id) => managedSet.has(id));
    } else {
      targetChapterIds = managedIds;
    }

    if (targetChapterIds.length === 0) {
      const empty: AlumniIntelligence = {
        industries: [],
        locations: [],
        totalAlumni: 0,
        alumniWithIndustry: 0,
        alumniWithLocation: 0,
        industryCompleteness: 0,
        locationCompleteness: 0,
      };
      return NextResponse.json(empty);
    }

    // Look up chapter names for the target IDs (the alumni table uses chapter name, not UUID)
    const { data: chapters, error: chaptersError } = await supabase
      .from('spaces')
      .select('id, name')
      .in('id', targetChapterIds);

    if (chaptersError) {
      console.error('alumni-intelligence chapters query error:', chaptersError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    const chapterNames = (chapters ?? []).map((c) => c.name).filter(Boolean);

    if (chapterNames.length === 0) {
      const empty: AlumniIntelligence = {
        industries: [],
        locations: [],
        totalAlumni: 0,
        alumniWithIndustry: 0,
        alumniWithLocation: 0,
        industryCompleteness: 0,
        locationCompleteness: 0,
      };
      return NextResponse.json(empty);
    }

    // Fetch alumni records with industry and location for matching chapters
    const { data: alumni, error: alumniError } = await supabase
      .from('alumni')
      .select('industry, location')
      .in('chapter', chapterNames);

    if (alumniError) {
      console.error('alumni-intelligence alumni query error:', alumniError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    const rows = alumni ?? [];
    const totalAlumni = rows.length;

    // --- Industry aggregation ---
    const industryCounts = new Map<string, number>();
    let alumniWithIndustry = 0;

    for (const row of rows) {
      if (!isValidField(row.industry)) continue;
      alumniWithIndustry++;
      const normalized = normalizeIndustry(row.industry) ?? row.industry;
      industryCounts.set(normalized, (industryCounts.get(normalized) ?? 0) + 1);
    }

    const industries = Array.from(industryCounts.entries())
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count);

    // --- Location / state aggregation ---
    const stateCodeMap = new Map<string, string>();
    for (const s of US_STATES) {
      stateCodeMap.set(s.name.toLowerCase(), s.code);
      stateCodeMap.set(s.code.toLowerCase(), s.code);
    }

    const stateCounts = new Map<string, number>();
    let alumniWithLocation = 0;
    let matchedToState = 0;

    for (const row of rows) {
      if (!isValidField(row.location)) continue;
      alumniWithLocation++;
      const code = extractStateCode(row.location, stateCodeMap);
      if (code) {
        stateCounts.set(code, (stateCounts.get(code) ?? 0) + 1);
        matchedToState++;
      }
    }

    // Build location array (only states with > 0 alumni)
    const locationsRaw = Array.from(stateCounts.entries())
      .map(([code, count]) => ({
        stateCode: code,
        state: US_STATES.find((s) => s.code === code)?.name ?? code,
        count,
        percent: alumniWithLocation > 0
          ? Math.round((count / alumniWithLocation) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Add "Other" bucket for locations that couldn't be matched to a US state
    const unmatched = alumniWithLocation - matchedToState;
    const locations =
      unmatched > 0
        ? [
            ...locationsRaw,
            {
              stateCode: 'OTHER',
              state: 'Other',
              count: unmatched,
              percent:
                alumniWithLocation > 0
                  ? Math.round((unmatched / alumniWithLocation) * 1000) / 10
                  : 0,
            },
          ]
        : locationsRaw;

    const result: AlumniIntelligence = {
      industries,
      locations,
      totalAlumni,
      alumniWithIndustry,
      alumniWithLocation,
      industryCompleteness:
        totalAlumni > 0
          ? Math.round((alumniWithIndustry / totalAlumni) * 100)
          : 0,
      locationCompleteness:
        totalAlumni > 0
          ? Math.round((alumniWithLocation / totalAlumni) * 100)
          : 0,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('alumni-intelligence API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function isValidField(value: unknown): value is string {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed !== '' &&
    trimmed !== 'Not specified' &&
    trimmed !== 'Not Specified' &&
    trimmed !== 'Not provided' &&
    trimmed !== 'Not Provided' &&
    trimmed !== 'N/A' &&
    trimmed !== 'n/a' &&
    trimmed !== 'Unknown' &&
    trimmed !== 'unknown' &&
    trimmed !== 'null' &&
    trimmed !== 'undefined' &&
    trimmed !== 'Not set' &&
    trimmed !== 'Not Set' &&
    trimmed !== 'TBD' &&
    trimmed !== 'tbd' &&
    trimmed !== 'TBA' &&
    trimmed !== 'tba'
  );
}

/**
 * Extracts a US state code from a location string.
 * Handles formats like "City, ST", "City, State Name", "ST", "State Name".
 */
function extractStateCode(
  location: string,
  stateCodeMap: Map<string, string>
): string | null {
  const trimmed = location.trim();

  // Try "City, ST" or "City, State Name" — take the part after the last comma
  const commaIdx = trimmed.lastIndexOf(',');
  if (commaIdx !== -1) {
    const afterComma = trimmed.substring(commaIdx + 1).trim().toLowerCase();
    const code = stateCodeMap.get(afterComma);
    if (code) return code;
  }

  // Try the entire string as a state name or code
  const asLower = trimmed.toLowerCase();
  return stateCodeMap.get(asLower) ?? null;
}
