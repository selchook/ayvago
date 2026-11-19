import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import styles from '@/components/legal/legal.module.css';
import pageStyles from '@/components/page.module.css';
import { Link } from '@/i18n/navigation';
import { getLiveGameCount } from '@/lib/catalog';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale }> };

const SECTIONS = [
  { id: 'studio', paragraphs: ['p1', 'p2'] },
  { id: 'play', paragraphs: ['p1', 'p2'] },
  { id: 'online', paragraphs: ['p1'] },
  { id: 'site', paragraphs: ['p1'] },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: localizedAlternates(locale, '/about'),
  };
}

/** About Ayvago (slice 3.5): what the platform is, who makes the games, what players get. */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('about');
  return (
    <article className={styles.legal}>
      <header className={pageStyles.header}>
        <h1>{t('title')}</h1>
        <p className={pageStyles.intro}>{t('intro', { count: getLiveGameCount() })}</p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
          <h2 id={`${section.id}-heading`}>{t(`${section.id}.title`)}</h2>
          {section.paragraphs.map((p) => (
            // Every id/paragraph pair above exists in the catalogs (the message test checks both).
            <p key={p}>{t(`${section.id}.${p}` as 'studio.p1')}</p>
          ))}
        </section>
      ))}
      <section id="contact" aria-labelledby="contact-heading">
        <h2 id="contact-heading">{t('contact.title')}</h2>
        <p>{t.rich('contact.p1', { link: (chunks) => <Link href="/contact">{chunks}</Link> })}</p>
      </section>
    </article>
  );
}
