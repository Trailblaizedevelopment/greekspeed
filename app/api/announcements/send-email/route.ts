import { NextRequest, NextResponse } from 'next/server';
import { EmailService } from '@/lib/services/emailService';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { getFirstAnnouncementImageFromMetadata } from '@/lib/validation/announcementMetadata';
import { buildPushPayload } from '@/lib/services/notificationPushPayload';
import { sendPushToUser } from '@/lib/services/oneSignalPushService';

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables first
    const requiredEnvVars = {
      SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
      SENDGRID_ANNOUNCEMENT_TEMPLATE_ID: process.env.SENDGRID_ANNOUNCEMENT_TEMPLATE_ID,
      SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return NextResponse.json(
        { error: `Missing environment variables: ${missingVars.join(', ')}` },
        { status: 500 }
      );
    }

    // All required environment variables are set
    
    const supabase = createServerSupabaseClient();
    const { 
      announcementId,
      testEmail // For testing purposes
    } = await request.json();

    if (!announcementId) {
      return NextResponse.json(
        { error: 'Announcement ID is required' },
        { status: 400 }
      );
    }

    // Get announcement details
    const { data: announcement, error: announcementError } = await supabase
      .from('announcements')
      .select(`
        id,
        title,
        content,
        announcement_type,
        chapter_id,
        metadata,
        sender:profiles!sender_id(
          id,
          first_name,
          last_name
        )
      `)
      .eq('id', announcementId)
      .single();

    if (announcementError || !announcement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      );
    }

    // Get chapter information
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, name')
      .eq('id', announcement.chapter_id)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    const announcementImage = getFirstAnnouncementImageFromMetadata(announcement.metadata);

    // For testing: send to specified email
    if (testEmail) {
      const testResult = await EmailService.sendChapterAnnouncement({
        to: testEmail,
        firstName: 'Test User',
        chapterName: chapter.name,
        title: announcement.title,
        summary: '', // You can add summary logic here if needed
        content: announcement.content,
        announcementId: announcement.id,
        announcementType: announcement.announcement_type,
        imageUrl: announcementImage?.url ?? null,
        imageAlt: announcementImage?.alt ?? null,
      });

      if (testResult) {
        return NextResponse.json({
          message: 'Test announcement email sent successfully',
          testEmail,
          announcement: {
            id: announcement.id,
            title: announcement.title,
            chapterName: chapter.name
          },
          details: {
            total: 1,
            successful: 1,
            failed: 0
          }
        }, { status: 200 });
      } else {
        return NextResponse.json(
          { error: 'Failed to send test announcement email' },
          { status: 500 }
        );
      }
    }

    // For production: send to all chapter members
    // Get all chapter members with email preferences
    const { data: members, error: membersError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        chapter_id,
        role,
        email_preferences
      `)
      .eq('chapter_id', announcement.chapter_id)
      .in('role', ['active_member', 'admin'])
      .not('email', 'is', null);

    if (membersError || !members) {
      return NextResponse.json(
        { error: 'Failed to fetch chapter members' },
        { status: 500 }
      );
    }

    // Chapter members found

    // Filter members who have opted into announcements
    const recipientMembers = members.filter(member => {
      if (member.role === 'alumni') {
        return false; // Exclude alumni
      }
      const preferences = member.email_preferences || {};
      return preferences.announcements !== false; // Default to true if not set
    });
    const recipients = recipientMembers.map(member => ({
      email: member.email,
      firstName: member.first_name || 'Member',
      chapterName: chapter.name
    }));

    // Recipients after filtering

    if (recipients.length === 0) {
      return NextResponse.json(
        { message: 'No recipients found for announcements' },
        { status: 200 }
      );
    }

    // About to send emails

    // Send announcements
    const result = await EmailService.sendAnnouncementToChapter(
      recipients,
      {
        title: announcement.title,
        summary: '', // You can add summary logic here if needed
        content: announcement.content,
        announcementId: announcement.id,
        announcementType: announcement.announcement_type,
        imageUrl: announcementImage?.url ?? null,
        imageAlt: announcementImage?.alt ?? null,
      }
    );

    // Push: notify each recipient
    const pushPayload = buildPushPayload('chapter_announcement', {
      announcementId: announcement.id,
      announcementTitle: announcement.title,
    });
    for (const member of recipientMembers) {
      sendPushToUser(member.id, pushPayload).catch(pushErr => {
        console.error('Failed to send announcement push to', member.id, pushErr);
      });
    }

    // Email sending result received

    // Update announcement to mark emails as sent
    await supabase
      .from('announcements')
      .update({ 
        metadata: {
          ...announcement.metadata,
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          email_recipients_count: result.successful
        }
      })
      .eq('id', announcementId);

    return NextResponse.json({
      message: 'Announcement emails sent successfully',
      announcement: {
        id: announcement.id,
        title: announcement.title,
        chapterName: chapter.name
      },
      details: result
    }, { status: 200 });

  } catch (error) {
    console.error('Announcement email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

