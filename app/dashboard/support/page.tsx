'use client';

import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SupportRequestForm } from '@/components/features/support/SupportRequestForm';
import { SUPPORT_EMAIL, SUPPORT_MAILTO_HREF } from '@/lib/constants/support';

export default function DashboardSupportPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:py-8 md:pb-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <LifeBuoy className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">Help &amp; support</h1>
            <p className="text-sm text-gray-500">
              Send a message to the Trailblaize team. We respond by email.
            </p>
          </div>
        </div>

        <Card className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <CardHeader className="border-b border-gray-100 pb-4">
            <CardTitle className="text-lg">Contact us</CardTitle>
            <CardDescription>
              Questions, billing, and bug reports go to the same inbox. For urgent security issues,
              email{' '}
              <Link href={SUPPORT_MAILTO_HREF} className="font-medium text-brand-primary hover:underline">
                {SUPPORT_EMAIL}
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <SupportRequestForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
