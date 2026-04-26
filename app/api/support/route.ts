import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SUPPORT_EMAIL } from '@/lib/constants/support';
import { EmailService } from '@/lib/services/emailService';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import {
  supportRequestBodySchema,
  type SupportRequestCategory,
} from '@/lib/validation/supportRequest';
import {
  checkSupportSubmissionCooldown,
  getSupportSubmissionCooldownSeconds,
  recordSuccessfulSupportSubmission,
} from '@/lib/server/supportSubmissionRateLimit';
import { recordSupportSubmissionAudit } from '@/lib/server/supportSubmissionAudit';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function categoryLabel(category: SupportRequestCategory): string {
  switch (category) {
    case 'question':
      return 'Question';
    case 'bug':
      return 'Bug report';
    case 'billing':
      return 'Billing';
    case 'other':
      return 'Other';
    default:
      return category;
  }
}

/**
 * POST /api/support
 * Authenticated users submit a support message; email is sent to the team inbox (TRA-626).
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sendgridKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!sendgridKey || !fromEmail) {
      return NextResponse.json({ error: 'Email is not configured' }, { status: 500 });
    }

    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = supportRequestBodySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.errors[0]?.message ?? 'Invalid request';
      return NextResponse.json({ error: first }, { status: 400 });
    }

    const { category, subject, body, pageUrl, userAgent } = parsed.data;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, chapter, full_name, first_name, last_name, member_status, chapter_role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Support API profile error:', profileError);
      return NextResponse.json({ error: 'Could not load profile' }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const cooldownSec = getSupportSubmissionCooldownSeconds();
    const rate = await checkSupportSubmissionCooldown(supabase, user.id, cooldownSec);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: 'You recently sent a message. Please wait before submitting again.',
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSec) },
        }
      );
    }

    const chapterName =
      typeof profile.chapter === 'string' && profile.chapter.trim()
        ? profile.chapter.trim()
        : null;

    const displayName =
      profile.full_name?.trim() ||
      [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
      'Unknown user';

    const inboundTo = process.env.SUPPORT_INBOUND_EMAIL?.trim() || SUPPORT_EMAIL;
    const catLabel = categoryLabel(category);
    const emailSubject = `[Trailblaize support] ${catLabel}: ${subject}`.slice(0, 998);

    const reporterEmail = user.email?.trim() ?? '';
    const replyToValid = z.string().email().safeParse(reporterEmail).success;

    const lines = [
      'New in-app support request',
      '',
      `Category: ${catLabel}`,
      `Subject: ${subject}`,
      '',
      'Message:',
      body,
      '',
      '---',
      `User ID: ${user.id}`,
      reporterEmail ? `User email: ${reporterEmail}` : 'User email: (not available)',
      profile.chapter_id ? `Chapter ID: ${profile.chapter_id}` : 'Chapter ID: (none)',
      chapterName ? `Chapter name: ${chapterName}` : '',
      profile.member_status ? `Member status: ${profile.member_status}` : '',
      profile.chapter_role ? `Chapter role: ${profile.chapter_role}` : '',
      pageUrl?.trim() ? `Page URL: ${pageUrl.trim()}` : '',
      userAgent?.trim() ? `User-Agent: ${userAgent.trim()}` : '',
    ].filter(Boolean);

    const textBody = lines.join('\n');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h2 style="margin-top:0;">In-app support request</h2>
  <p><strong>Category:</strong> ${escapeHtml(catLabel)}</p>
  <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
  <p><strong>From:</strong> ${escapeHtml(displayName)}${reporterEmail ? ` &lt;${escapeHtml(reporterEmail)}&gt;` : ''}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="white-space: pre-wrap;">${escapeHtml(body)}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="font-size: 13px; color: #444;">
    <strong>User ID:</strong> ${escapeHtml(user.id)}<br/>
    ${profile.chapter_id ? `<strong>Chapter ID:</strong> ${escapeHtml(profile.chapter_id)}<br/>` : ''}
    ${chapterName ? `<strong>Chapter:</strong> ${escapeHtml(chapterName)}<br/>` : ''}
    ${profile.member_status ? `<strong>Member status:</strong> ${escapeHtml(String(profile.member_status))}<br/>` : ''}
    ${profile.chapter_role ? `<strong>Chapter role:</strong> ${escapeHtml(String(profile.chapter_role))}<br/>` : ''}
    ${pageUrl?.trim() ? `<strong>Page URL:</strong> ${escapeHtml(pageUrl.trim())}<br/>` : ''}
    ${userAgent?.trim() ? `<strong>User-Agent:</strong> ${escapeHtml(userAgent.trim())}` : ''}
  </p>
</body>
</html>`.trim();

    const sent = await EmailService.sendSupportTeamInbound({
      to: inboundTo,
      subject: emailSubject,
      html: htmlBody,
      text: textBody,
      replyTo: replyToValid
        ? { email: reporterEmail, name: displayName !== 'Unknown user' ? displayName : undefined }
        : undefined,
    });

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send support request' }, { status: 500 });
    }

    await recordSuccessfulSupportSubmission(supabase, user.id);

    // TRA-631: audit row only after successful outbound email (same success path as rate limiter).
    await recordSupportSubmissionAudit(supabase, {
      user_id: user.id,
      chapter_id: profile.chapter_id ?? null,
      chapter_name: chapterName,
      category,
      subject,
      body,
      reporter_email: reporterEmail || null,
      page_url: pageUrl?.trim() ? pageUrl.trim().slice(0, 2048) : null,
      user_agent: userAgent?.trim() ? userAgent.trim().slice(0, 500) : null,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Support API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
