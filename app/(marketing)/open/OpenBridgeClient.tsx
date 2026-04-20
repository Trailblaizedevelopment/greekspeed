'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Globe, Smartphone } from 'lucide-react';

export interface OpenBridgeClientProps {
  continuePath: string;
  intentLabel: string | null;
  /** Resolved from a valid chapter invitation only; never set from invalid tokens. */
  chapterInviteName: string | null;
  iosUrl: string | null;
  androidUrl: string | null;
}

const motionCard = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1] as const },
};

export function OpenBridgeClient({
  continuePath,
  intentLabel,
  chapterInviteName,
  iosUrl,
  androidUrl,
}: OpenBridgeClientProps) {
  const hasStores = Boolean(iosUrl || androidUrl);

  const title = chapterInviteName ? `Join ${chapterInviteName}` : null;

  const subtitle = chapterInviteName
    ? 'Continue in your browser to accept this invitation, or open the Trailblaize mobile app through app store.'
    : 'Pick up where your link left off. Continue in your browser for the full web experience, or download our mobile app.';

  const showIntentEyebrow =
    intentLabel && !chapterInviteName && intentLabel !== 'Chapter invitation';

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader hideNavigation />

      <section
        className="relative pt-16 pb-24 sm:pt-20 sm:pb-28 overflow-hidden"
        aria-label="Trailblaize — choose web browser or mobile app"
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50/40 pointer-events-none"
          aria-hidden
        />
        <div className="relative max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...motionCard}>
            <p className="text-center text-sm font-semibold tracking-wide text-brand-primary uppercase mb-3">
              Trailblaize
            </p>

            {title ? (
              <h1
                id="open-bridge-heading"
                className="text-center text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight leading-tight"
              >
                {title}
              </h1>
            ) : null}

            <p
              className={cn(
                'text-center text-base sm:text-lg text-gray-600 leading-relaxed max-w-md mx-auto',
                title ? 'mt-3' : 'mt-1'
              )}
            >
              {subtitle}
            </p>

            {chapterInviteName ? (
              <p className="mt-2 text-center text-sm text-gray-500">
                Chapter invitation · verified link
              </p>
            ) : null}

            {showIntentEyebrow ? (
              <p className="mt-2 text-center text-sm text-gray-500">{intentLabel}</p>
            ) : null}

            <div className="mt-10 rounded-2xl border border-gray-100 bg-white/95 backdrop-blur-sm shadow-xl shadow-gray-200/50 p-6 sm:p-9 space-y-8">
              <div className="flex justify-center py-1">
                <Image
                  src="/logo.png"
                  alt="Trailblaize"
                  width={320}
                  height={90}
                  className="h-16 sm:h-[4.75rem] w-auto max-w-[min(100%,280px)] object-contain"
                  priority
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider text-center">
                  Recommended for this device
                </p>
                <Link
                  href={continuePath}
                  className={cn(
                    buttonVariants({ variant: 'default', size: 'lg' }),
                    'w-full min-h-[48px] py-3.5 text-base font-semibold rounded-xl',
                    'bg-brand-primary text-white hover:bg-brand-primary-hover shadow-md',
                    'inline-flex items-center justify-center gap-2.5',
                    'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-primary'
                  )}
                  aria-label="Continue to Trailblaize in your browser"
                >
                  <Globe className="h-5 w-5 shrink-0" aria-hidden />
                  Continue in browser
                </Link>
                <p className="text-center text-xs text-gray-500 leading-snug">
                  Same account and chapter access as the mobile app.
                </p>
              </div>

              <div
                className="relative py-2"
                role="separator"
                aria-orientation="horizontal"
              >
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs font-medium uppercase tracking-wider">
                  <span className="bg-white px-3 text-gray-400">Or</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider text-center">
                  Mobile app
                </p>
                {hasStores ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    {iosUrl ? (
                      <a
                        href={iosUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'lg' }),
                          'flex-1 min-h-[48px] rounded-xl border-gray-300 bg-white',
                          'font-medium text-gray-900 hover:bg-gray-50',
                          'inline-flex items-center justify-center gap-2'
                        )}
                        aria-label="Download on the App Store. Opens in a new tab."
                      >
                        <Smartphone className="h-5 w-5 shrink-0 text-gray-700" aria-hidden />
                        App Store
                      </a>
                    ) : null}
                    {androidUrl ? (
                      <a
                        href={androidUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'lg' }),
                          'flex-1 min-h-[48px] rounded-xl border-gray-300 bg-white',
                          'font-medium text-gray-900 hover:bg-gray-50',
                          'inline-flex items-center justify-center gap-2'
                        )}
                        aria-label="Get it on Google Play. Opens in a new tab."
                      >
                        <Smartphone className="h-5 w-5 shrink-0 text-gray-700" aria-hidden />
                        Google Play
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/90 px-4 py-4 text-center">
                    <p className="text-sm text-gray-600 leading-relaxed">
                      <span className="font-medium text-gray-800">Beta or TestFlight?</span>{' '}
                      Use the install link your chapter or team shared. Store buttons appear
                      here once public listing URLs are configured for this environment.
                    </p>
                  </div>
                )}
              </div>

              <nav
                className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 border-t border-gray-100"
                aria-label="Legal and help"
              >
                <Link
                  href="/privacy"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Privacy
                </Link>
                <Link
                  href="/contact"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Contact
                </Link>
                <Link
                  href="/"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Home
                </Link>
              </nav>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
