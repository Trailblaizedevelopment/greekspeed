'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { SUPPORT_EMAIL, SUPPORT_MAILTO_HREF } from '@/lib/constants/support';
import {
  SUPPORT_REQUEST_CATEGORIES,
  type SupportRequestCategory,
} from '@/lib/validation/supportRequest';
import { useAuth } from '@/lib/supabase/auth-context';

const CATEGORY_LABELS: Record<SupportRequestCategory, string> = {
  question: 'Question',
  bug: 'Bug report',
  billing: 'Billing',
  other: 'Other',
};

export function SupportRequestForm() {
  const { getAuthHeadersAsync } = useAuth();
  const [category, setCategory] = useState<SupportRequestCategory>('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includePageUrl, setIncludePageUrl] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('idle');
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const headers = await getAuthHeadersAsync();
      const pageUrl =
        includePageUrl && typeof window !== 'undefined' ? window.location.href : undefined;
      const userAgent =
        typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : undefined;

      const res = await fetch('/api/support', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          body: body.trim(),
          pageUrl: pageUrl ?? null,
          userAgent: userAgent ?? null,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setStatus('error');
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setStatus('success');
      setSubject('');
      setBody('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error && err.message === 'AUTH_REQUIRED'
          ? 'You need to be signed in to send a message.'
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="support-category">Category</Label>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as SupportRequestCategory)}
          placeholder="Choose a category"
        >
          {SUPPORT_REQUEST_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </SelectItem>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-subject">Subject</Label>
        <Input
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary"
          maxLength={200}
          required
          disabled={isSubmitting}
          className="border-gray-200 focus:border-brand-primary focus:ring-brand-primary"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-body">Message</Label>
        <Textarea
          id="support-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe your question, issue, or feedback…"
          className="min-h-[160px] w-full resize-y border-gray-200 focus:border-brand-primary focus:ring-brand-primary"
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="support-include-url"
          checked={includePageUrl}
          onCheckedChange={(checked) => setIncludePageUrl(Boolean(checked))}
          disabled={isSubmitting}
        />
        <Label htmlFor="support-include-url" className="text-sm font-normal text-gray-700 cursor-pointer leading-snug">
          Include current page URL (helps us reproduce bugs)
        </Label>
      </div>

      {status === 'success' && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Thanks — your message was sent. We&apos;ll follow up by email when we can.
        </p>
      )}

      {status === 'error' && errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 space-y-2">
          <p>{errorMessage}</p>
          <p className="text-red-800">
            You can also email us at{' '}
            <Link href={SUPPORT_MAILTO_HREF} className="font-medium underline hover:text-red-950">
              {SUPPORT_EMAIL}
            </Link>
            .
          </p>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
