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
const UPDATED = new Date('2026-11-20T00:00:00Z');

// `id` is the anchor, `key` the message namespace (when they differ).
const SECTIONS = [
  { id: 'data', paragraphs: ['p1', 'signIn', 'p2', 'p3'] },
  // Meta's "User data deletion" instructions URL points here: keep the anchor stable.
  { id: 'delete-data', key: 'deleteData', paragraphs: ['p1', 'p2'] },
  { id: 'storage', paragraphs: ['p1', 'p2'] },
  { id: 'ads', paragraphs: ['p1', 'p2', 'p3', 'p4', 'p5'] },
  // GDPR in English, KVKK in Turkish: each locale carries the law that fits its readers.
  { id: 'rights', paragraphs: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] },
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
 * Privacy and cookies (Phase 3, slice 3.1): what the platform stores, the storage it uses, how ads
 * and consent work, and the reader's rights: the GDPR on the English page, KVKK on the Turkish one.
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
      {SECTIONS.map((section) => {
        const key = 'key' in section ? section.key : section.id;
        return (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
            <h2 id={`${section.id}-heading`}>{t(`${key}.title`)}</h2>
            {section.paragraphs.map((p) => (
              // Every key/paragraph pair above exists in the catalogs (the message test checks both).
              <p key={p}>{t(`${key}.${p}` as 'data.p1')}</p>
            ))}
            {section.id === 'ads' ? <AdChoice /> : null}
          </section>
        );
      })}
      <section id="contact" aria-labelledby="contact-heading">
        <h2 id="contact-heading">{t('contact.title')}</h2>
        <p>
          {PRIVACY_CONTACT ? (
            t.rich('contact.withEmail', {
              email: PRIVACY_CONTACT,
              link: (chunks) => <a href={`mailto:${PRIVACY_CONTACT}`}>{chunks}</a>,
            })
          ) : (
            <Link href="/profile">{t('contact.withoutEmail')}</Link>
          )}
        </p>
      </section>
    </article>
  );
}
