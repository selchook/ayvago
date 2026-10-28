import { buildThemeCss, DEFAULT_THEME, themeBootstrapScript } from '@ayvago/themes';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/shell/app-shell';
import { ThemeRestorer } from '@/components/theme-restorer';
import { routing } from '@/i18n/routing';
import { INSTALL_CAPTURE_SCRIPT } from '@/lib/pwa/install-capture';
import { BAR_COLOR_SCRIPT } from '@/lib/pwa/manifest';
import { SITE_URL, localizedAlternates } from '@/lib/seo';
// Self-hosted fonts (Latin + Latin Extended for Turkish); each face downloads only when used.
import '@fontsource-variable/inter';
import '@fontsource/press-start-2p';
import '@fontsource/vt323';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/baloo-2';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

// Generated once per build; identical on every page.
const themeCss = buildThemeCss();

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // theme-color is rendered in the layout's <head> instead (BAR_COLOR_SCRIPT).
};

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
    alternates: localizedAlternates(locale, ''),
    openGraph: { siteName: t('title'), locale, type: 'website' },
    appleWebApp: { capable: true, title: t('title'), statusBarStyle: 'black-translucent' },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // The bootstrap script may change data-theme/data-mode before hydration.
    <html lang={locale} data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <style id="ayvago-themes" dangerouslySetInnerHTML={{ __html: themeCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {/* Theme-aware system bars (theme-color, manifest), set before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: BAR_COLOR_SCRIPT }} />
        {/* Keeps an early beforeinstallprompt for the install banner (lib/pwa/install-store.ts). */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body>
        <ThemeRestorer />
        <NextIntlClientProvider>
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
