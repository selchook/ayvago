import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import styles from '@/components/legal/legal.module.css';
import pageStyles from '@/components/page.module.css';
import { Link } from '@/i18n/navigation';
import { PRIVACY_CONTACT } from '@/lib/ads/config';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale }> };

const TOPICS = ['bug', 'idea', 'account', 'privacy', 'business'] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: localizedAlternates(locale, '/contact'),
  };
}

/** Contact (slice 3.5): the same address as the footer and the privacy page. */
export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('contact');
  return (
    <article className={styles.legal}>
      <header className={pageStyles.header}>
        <h1>{t('title')}</h1>
        <p className={pageStyles.intro}>{t('intro')}</p>
      </header>
      <section aria-label={t('title')}>
        <p className={styles.lead}>
          {t.rich('email', {
            email: PRIVACY_CONTACT,
            link: (chunks) => <a href={`mailto:${PRIVACY_CONTACT}`}>{chunks}</a>,
          })}
        </p>
      </section>
      <section aria-labelledby="topics-heading">
        <h2 id="topics-heading">{t('topicsTitle')}</h2>
        <ul className={styles.list}>
          {TOPICS.map((topic) => (
            <li key={topic}>{t(`topics.${topic}`)}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="self-heading">
        <h2 id="self-heading">{t('selfServiceTitle')}</h2>
        <p>
          {t.rich('selfService', {
            profile: (chunks) => <Link href="/profile">{chunks}</Link>,
            privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
          })}
        </p>
      </section>
    </article>
  );
}
