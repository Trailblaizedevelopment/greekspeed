'use client';

import Image from 'next/image';
import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Smartphone, ExternalLink } from 'lucide-react';

export interface OpenBridgeClientProps {
  continuePath: string;
  intentLabel: string | null;
  iosUrl: string | null;
  androidUrl: string | null;
}

export function OpenBridgeClient({
  continuePath,
  intentLabel,
  iosUrl,
  androidUrl,
}: OpenBridgeClientProps) {
  const hasStores = Boolean(iosUrl || androidUrl);

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader hideNavigation />

      <div className="pt-20 pb-16 px-4 sm:px-6">
        <div className="max-w-lg mx-auto">
          <Card className="border border-gray-200 shadow-sm rounded-xl">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="flex justify-center mb-2">
                  <Image
                    src="/logo.png"
                    alt="Trailblaize"
                    width={200}
                    height={56}
                    className="h-14 w-auto object-contain"
                    priority
                  />
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  Open Trailblaize
                </h1>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Continue in your browser or download the app. If you already
                  have the app installed, use Open in app from your invitation or
                  notification.
                </p>
                {intentLabel ? (
                  <p className="text-xs text-gray-500 pt-1">{intentLabel}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href={continuePath}
                  className={cn(
                    buttonVariants({ variant: 'default', size: 'lg' }),
                    'w-full py-3 text-base font-medium rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white'
                  )}
                >
                  <ExternalLink className="h-4 w-4 mr-2 inline shrink-0" aria-hidden />
                  Continue on web
                </Link>

                {hasStores ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-center text-gray-500 uppercase tracking-wide">
                      Get the app
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {iosUrl ? (
                        <a
                          href={iosUrl}
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: 'outline', size: 'default' }),
                            'flex-1 border-gray-300'
                          )}
                        >
                          <Smartphone className="h-4 w-4 mr-2 inline shrink-0" aria-hidden />
                          App Store
                        </a>
                      ) : null}
                      {androidUrl ? (
                        <a
                          href={androidUrl}
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: 'outline', size: 'default' }),
                            'flex-1 border-gray-300'
                          )}
                        >
                          <Smartphone className="h-4 w-4 mr-2 inline shrink-0" aria-hidden />
                          Google Play
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-xs text-gray-500">
                    App store links are not configured for this environment yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
