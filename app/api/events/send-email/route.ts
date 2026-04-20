import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchChapterEventPublishedNotifications } from '@/lib/services/chapterEventNotificationDispatch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configure function timeout for Vercel (60 seconds for Pro plan)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();

    const { eventId, chapterId, send_sms, send_sms_to_alumni } = requestBody;

    const result = await dispatchChapterEventPublishedNotifications(supabase, {
      eventId,
      chapterId,
      send_sms: send_sms === true,
      send_sms_to_alumni: send_sms_to_alumni === true,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Event notification emails sent successfully',
      emailResult: {
        totalRecipients: result.totalRecipients,
        successful: result.successful,
        failed: result.failed,
      },
    });
  } catch (error) {
    console.error('Error in send event email API:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
