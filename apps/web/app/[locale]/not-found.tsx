import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function LocaleNotFound() {
  const t = useTranslations('notFound');
  return (
    <main className="landing">
      <h1>{t('title')}</h1>
      <Link href="/">{t('backHome')}</Link>
    </main>
  );
}
