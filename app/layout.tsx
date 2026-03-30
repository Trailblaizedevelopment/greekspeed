import "../styles/globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from '@/lib/supabase/auth-context';
import { ProfileProvider } from '@/lib/contexts/ProfileContext';
import { BrandingProvider } from '@/lib/contexts/BrandingContext';
import { ConnectionsProvider } from '@/lib/contexts/ConnectionsContext';
import AppQueryProvider from '@/lib/query/AppQueryProvider';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { APP_METADATA } from '@/lib/constants/metadata';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.trailblaize.net';

// Default metadata for the entire app; routes without their own metadata inherit this (share previews, SEO).
export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: APP_METADATA.title,
    template: '%s | Trailblaize',
  },
  description: APP_METADATA.description,
  openGraph: {
    title: APP_METADATA.title,
    description: APP_METADATA.description,
    url: baseUrl,
    siteName: APP_METADATA.siteName,
    images: [
      {
        url: APP_METADATA.ogImagePath,
        width: 1200,
        height: 630,
        alt: APP_METADATA.title,
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_METADATA.title,
    description: APP_METADATA.description,
    images: [APP_METADATA.ogImagePath],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/android-chrome-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/android-chrome-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

// Viewport configuration for mobile keyboard support
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content', // Critical for mobile keyboard handling
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
      <html lang="en">
        <head>
          {/* Viewport meta tag is now handled by Next.js viewport export */}
          {/* Google Fonts - Instrument Serif */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
          {/* Force browser to use PNG favicon - better quality than ICO */}
          <link rel="icon" type="image/png" sizes="32x32" href="/icon-32x32.png" />
          <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="manifest" href="/site.webmanifest" />
        </head>
        <body 
          className="antialiased bg-white text-gray-900"
          suppressHydrationWarning={true}
        >
          <AppQueryProvider>
            <AuthProvider>
              <ProfileProvider>
                <BrandingProvider>
                  <ConnectionsProvider>
                    {children}
                  </ConnectionsProvider>
                </BrandingProvider>
              </ProfileProvider>
            </AuthProvider>
          </AppQueryProvider>
          <Analytics />
          <SpeedInsights />
          {/* Single container (one react-toastify registry). Responsive classes = mobile vs desktop look. */}
          <ToastContainer
            position="top-right"
            autoClose={3500}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable={false}
            pauseOnHover
            theme="light"
            className="!px-2 !pt-2 !pb-2 sm:!px-4 sm:!pt-4 sm:!pb-4 !w-[min(100%,20rem)] sm:!w-auto !left-auto !right-2 sm:!right-4 !top-2 sm:!top-4"
            style={{ zIndex: 10004 }}
            toastClassName="!bg-white !shadow-lg !border !border-gray-200 !rounded-md sm:!rounded-lg !p-3 !min-h-[52px] sm:!p-4 sm:!min-h-[60px] !text-sm sm:!text-base !mb-2 sm:!mb-3"
          />
        </body>
      </html>
  );
}