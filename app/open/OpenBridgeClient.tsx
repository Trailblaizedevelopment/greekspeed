'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
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

/**
 * Minimal web ↔ app bridge: no marketing header/footer — only continue path + optional stores + legal.
 */
export function OpenBridgeClient({
  continuePath,
  intentLabel,
  chapterInviteName,
  iosUrl,
  androidUrl,
}: OpenBridgeClientProps) {
  const hasStores = Boolean(iosUrl || androidUrl);

  const showIntentEyebrow =
    intentLabel && !chapterInviteName && intentLabel !== 'Chapter invitation';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <h1 className="sr-only">Trailblaize — continue on the web or in the app</h1>

      <section
        className="relative flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-14 overflow-hidden"
        aria-label="Trailblaize — choose web browser or mobile app"
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50/40 pointer-events-none"
          aria-hidden
        />
        <div className="relative w-full max-w-xl mx-auto">
          <motion.div {...motionCard}>
            <div className="rounded-2xl border border-gray-100 bg-white/95 backdrop-blur-sm shadow-xl shadow-gray-200/50 overflow-hidden">
              {/* Full-width logo hero (fills top band of the card) */}
              <div className="relative w-full border-b border-gray-100 bg-gradient-to-b from-gray-50 via-white to-white">
                <div className="flex min-h-[140px] sm:min-h-[180px] w-full items-center justify-center px-5 py-8 sm:px-8 sm:py-10">
                  <Image
                    src="/logo.png"
                    alt="Trailblaize"
                    width={640}
                    height={200}
                    className="w-full h-auto max-h-[100px] sm:max-h-[140px] md:max-h-[160px] object-contain object-center"
                    sizes="(max-width: 640px) 100vw, 36rem"
                    priority
                  />
                </div>
              </div>

              <div className="p-6 sm:p-9 space-y-8">
                {chapterInviteName ? (
                  <div className="text-center space-y-2">
                    <h2
                      id="open-bridge-heading"
                      className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight leading-tight"
                    >
                      Join {chapterInviteName}
                    </h2>
                    <p className="text-sm text-gray-500">
                      Chapter invitation · verified link
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed pt-1">
                      Continue in your browser to accept this invitation, or use the
                      mobile app if you already have it installed.
                    </p>
                  </div>
                ) : null}

                {showIntentEyebrow ? (
                  <p className="text-center text-sm text-gray-500">{intentLabel}</p>
                ) : null}

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
                          <Image
                            src="/app-store.svg"
                            alt=""
                            width={20}
                            height={20}
                            className="h-8 w-8 shrink-0 object-contain"
                            aria-hidden
                            unoptimized
                          />
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
                  className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 border-t border-gray-100"
                  aria-label="Legal"
                >
                  <Link
                    href="/privacy"
                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    Privacy
                  </Link>
                  <span className="text-gray-300 select-none" aria-hidden>
                    ·
                  </span>
                  <Link
                    href="/contact"
                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    Contact
                  </Link>
                </nav>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
