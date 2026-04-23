import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    // Get current date and last month date
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthISO = lastMonth.toISOString();
    
    // Fetch profiles with creation dates and roles
    const { data: allProfiles, error: allProfilesError } = await supabase
      .from('profiles')
      .select('created_at, role');

    if (allProfilesError) {
      console.error('API: All profiles fetch error:', allProfilesError);
      return NextResponse.json({ error: 'Failed to fetch all profiles' }, { status: 500 });
    }

    // Calculate total users and new users this month
    const totalUsers = allProfiles.length;
    const newUsersThisMonth = allProfiles.filter(
      (profile) => new Date(profile.created_at) >= lastMonth
    ).length;

    // Calculate user growth percentage
    const userGrowthPercentage = totalUsers > 0 
      ? ((newUsersThisMonth / (totalUsers - newUsersThisMonth || 1)) * 100).toFixed(1)
      : '0.0';

    // Calculate total alumni and new alumni this month
    const allAlumni = allProfiles.filter(profile => profile.role === 'alumni');
    const totalAlumni = allAlumni.length;
    const newAlumniThisMonth = allAlumni.filter(
      (alumni) => new Date(alumni.created_at) >= lastMonth
    ).length;

    // Fetch chapters with creation dates
    const { data: allChapters, error: chaptersError } = await supabase
      .from('spaces')
      .select('created_at'); // Add created_at to get creation dates

    if (chaptersError) {
      console.error('API: Chapters fetch error:', chaptersError);
      return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
    }

    // Calculate total chapters and new chapters this month
    const totalChapters = allChapters.length;
    const newChaptersThisMonth = allChapters.filter(
      (chapter) => new Date(chapter.created_at) >= lastMonth
    ).length;

    // For system health, let's just return a static value for now
    const systemHealth = 'healthy';

    return NextResponse.json({
      totalUsers,
      newUsersThisMonth,
      userGrowthPercentage, // Add this back
      totalChapters,
      newChaptersThisMonth, // Add this field
      totalAlumni,
      newAlumniThisMonth,
      systemHealth,
      message: 'Data fetched successfully',
      debug: {
        allProfiles,
        allProfilesError,
        profilesCount: totalUsers,
        chaptersCount: totalChapters,
        alumniCount: totalAlumni,
        newUsersThisMonthCount: newUsersThisMonth,
        newAlumniThisMonthCount: newAlumniThisMonth,
        userGrowthPercentage: userGrowthPercentage,
      }
    });
  } catch (error) {
    console.error('API: Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
