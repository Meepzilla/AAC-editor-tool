import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import AppProviders from '@/providers/app-providers';

export const metadata: Metadata = {
  title: 'AAC Profile Manager',
  description:
    'On-device AAC caseload profile manager for Speech-Language Pathologists. Private, offline-first, no cloud sync.',
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="AAC Profiles" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
