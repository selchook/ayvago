import { useTranslations } from 'next-intl';
import styles from '@/components/page.module.css';
import { Link } from '@/i18n/navigation';

export default function LocaleNotFound() {
  const t = useTranslations('notFound');
  return (
    <div className={styles.empty}>
      <h1>{t('title')}</h1>
      <Link href="/" className={styles.button}>
        {t('backHome')}
      </Link>
    </div>
  );
}
