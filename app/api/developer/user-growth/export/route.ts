import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import type { MetricType } from '@/types/user-growth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    
    const metricType = searchParams.get('metric_type') as MetricType;
    const chapterId = searchParams.get('chapter_id') || undefined;
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const activityWindow = parseInt(searchParams.get('activity_window') || '30');

    if (!metricType) {
      return NextResponse.json({ error: 'metric_type is required' }, { status: 400 });
    }

    // Build query (same logic as users endpoint but without pagination)
    let query = supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        phone,
        chapter_id,
        role,
        chapter_role,
        member_status,
        created_at,
        last_active_at,
        spaces!left(id, name)
      `);

    // Apply metric-specific filters
    switch (metricType) {
      case 'total':
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

    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching users for export:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Generate CSV
    const headers = [
      'ID',
      'Full Name',
      'Email',
      'Phone',
      'Chapter',
      'Role',
      'Chapter Role',
      'Member Status',
      'Created At',
      'Last Active At',
    ];

    const rows = (data || []).map((profile: any) => [
      profile.id,
      profile.full_name || '',
      profile.email || '',
      profile.phone || '',
      Array.isArray(profile.spaces)
        ? profile.spaces[0]?.name || ''
        : profile.spaces?.name || '',
      profile.role || '',
      profile.chapter_role || '',
      profile.member_status || '',
      profile.created_at || '',
      profile.last_active_at || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          const escaped = String(cell).replace(/"/g, '""');
          if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
            return `"${escaped}"`;
          }
          return escaped;
        }).join(',')
      ),
    ].join('\n');

    const filename = `user-growth-${metricType}-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('User growth export API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
