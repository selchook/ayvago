import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://ayvago.com'),
  title: { default: 'Ayvago', template: '%s · Ayvago' },
  description: 'Retro aksiyon, casual ve bulmaca oyunları tek platformda.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Theme switching (retro / cartoon / minimal) lands in Phase 1; minimal is the default.
    <html lang="tr" data-theme="minimal">
      <body>{children}</body>
    </html>
  );
}
