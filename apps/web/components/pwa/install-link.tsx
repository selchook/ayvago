'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { requestInstall, startInstallStore, useInstall } from '@/lib/pwa/install-store';
import { DownloadIcon } from '../icons';

// "Install the app" entry at the bottom of the menu, shown until Ayvago runs as an installed
// app. Opens the browser's prompt, or the banner with the steps for this browser.
export function InstallLink({
  className,
  labelClassName,
}: {
  className?: string;
  labelClassName?: string;
}) {
  const t = useTranslations('install');
  const { ready, installed } = useInstall();
  useEffect(() => startInstallStore(), []);
  if (!ready || installed) return null;
  return (
    <button type="button" className={className} onClick={() => void requestInstall()}>
      <DownloadIcon />
      <span className={labelClassName}>{t('link')}</span>
    </button>
  );
}
