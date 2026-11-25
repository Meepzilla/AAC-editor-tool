import type { Metadata, Viewport } from 'next';
import './globals.css';
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
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="AAC Profiles" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
