import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AdChoice } from '@/components/legal/ad-choice';
import styles from '@/components/legal/legal.module.css';
import pageStyles from '@/components/page.module.css';
import { Link } from '@/i18n/navigation';
import { PRIVACY_CONTACT } from '@/lib/ads/config';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale }> };

/** Bump when the text changes in substance. */
const UPDATED = new Date('2026-11-11T00:00:00Z');

const SECTIONS = [
  { id: 'data', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'storage', paragraphs: ['p1', 'p2'] },
  { id: 'ads', paragraphs: ['p1', 'p2', 'p3', 'p4', 'p5'] },
  { id: 'kvkk', paragraphs: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacy' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: localizedAlternates(locale, '/privacy'),
  };
}

/**
 * Privacy, cookies and KVKK (Phase 3, slice 3.1): what the platform stores, the storage it uses,
 * how ads and consent work, and the KVKK notice. One page, both locales.
 */
export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, format] = await Promise.all([getTranslations('privacy'), getFormatter()]);
  return (
    <article className={styles.legal}>
      <header className={pageStyles.header}>
        <h1>{t('title')}</h1>
        <p className={pageStyles.intro}>{t('intro')}</p>
        <p className={pageStyles.count}>
          {t('updated', { date: format.dateTime(UPDATED, { dateStyle: 'long', timeZone: 'UTC' }) })}
        </p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
          <h2 id={`${section.id}-heading`}>{t(`${section.id}.title`)}</h2>
          {section.paragraphs.map((p) => (
            // Every id/paragraph pair above exists in the catalogs (the message test checks both).
            <p key={p}>{t(`${section.id}.${p}` as 'data.p1')}</p>
          ))}
          {section.id === 'ads' ? <AdChoice /> : null}
        </section>
      ))}
      <section id="contact" aria-labelledby="contact-heading">
        <h2 id="contact-heading">{t('contact.title')}</h2>
        <p>
          {PRIVACY_CONTACT ? (
            t('contact.withEmail', { email: PRIVACY_CONTACT })
          ) : (
            <Link href="/profile">{t('contact.withoutEmail')}</Link>
          )}
        </p>
      </section>
    </article>
  );
}
