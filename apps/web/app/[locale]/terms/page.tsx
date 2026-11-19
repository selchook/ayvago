import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import styles from '@/components/legal/legal.module.css';
import pageStyles from '@/components/page.module.css';
import { PRIVACY_CONTACT } from '@/lib/ads/config';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale }> };

/** Bump when the text changes in substance. */
const UPDATED = new Date('2026-11-19T00:00:00Z');

const SECTIONS = [
  { id: 'service', paragraphs: ['p1', 'p2'] },
  { id: 'accounts', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'fairPlay', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'names', paragraphs: ['p1', 'p2'] },
  { id: 'ads', paragraphs: ['p1', 'p2', 'p3', 'p4'] },
  { id: 'rights', paragraphs: ['p1', 'p2'] },
  { id: 'liability', paragraphs: ['p1', 'p2'] },
  { id: 'changes', paragraphs: ['p1'] },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'terms' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: localizedAlternates(locale, '/terms'),
  };
}

/**
 * Terms of use (slice 3.5): a plain draft for the owner's legal review (docs/setup/phase-3.md).
 * The ad and purchase paragraphs describe what the ad manager does (docs/adr/0023).
 */
export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, format] = await Promise.all([getTranslations('terms'), getFormatter()]);
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
            <p key={p}>{t(`${section.id}.${p}` as 'service.p1')}</p>
          ))}
        </section>
      ))}
      <section id="contact" aria-labelledby="contact-heading">
        <h2 id="contact-heading">{t('contact.title')}</h2>
        <p>
          {t.rich('contact.p1', {
            email: PRIVACY_CONTACT,
            link: (chunks) => <a href={`mailto:${PRIVACY_CONTACT}`}>{chunks}</a>,
          })}
        </p>
      </section>
    </article>
  );
}
