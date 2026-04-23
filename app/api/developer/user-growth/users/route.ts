import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import type { MetricType, UserListResponse } from '@/types/user-growth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    
    const metricType = searchParams.get('metric_type') as MetricType;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    const chapterId = searchParams.get('chapter_id') || undefined;
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    if (!metricType) {
      return NextResponse.json({ error: 'metric_type is required' }, { status: 400 });
    }

    // Build base query
    let query = supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        chapter_id,
        role,
        chapter_role,
        member_status,
        created_at,
        last_active_at,
        spaces!left(id, name)
      `, { count: 'exact' });

    // Apply metric-specific filters
    switch (metricType) {
      case 'total':
        // No additional filters
        break;
      case 'admin':
        query = query
          .eq('member_status', 'active')
          .in('chapter_role', EXECUTIVE_ROLES);
        break;
      case 'alumni':
        query = query
          .eq('role', 'alumni')
          .eq('member_status', 'active');
        break;
      case 'active_member':
        query = query
          .eq('role', 'active_member')
          .eq('member_status', 'active');
        break;
    }

    // Apply chapter filter
    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    }

    // Apply date range filter
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Apply pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const users = (data || []).map((profile: any) => ({
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      chapter_id: profile.chapter_id,
      chapter_name: Array.isArray(profile.spaces)
        ? profile.spaces[0]?.name || null
        : profile.spaces?.name || null,
      role: profile.role,
      chapter_role: profile.chapter_role,
      member_status: profile.member_status,
      created_at: profile.created_at,
      last_active_at: profile.last_active_at,
    }));

    return NextResponse.json({
      users,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    } as UserListResponse);
  } catch (error) {
    console.error('User growth users API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
