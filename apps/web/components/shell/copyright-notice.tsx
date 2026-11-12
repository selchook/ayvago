'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { copyrightYears } from '@/lib/copyright';

const noSubscribe = () => () => {};

// The copyright line. Pages are prerendered, so the server's year can be from an older build:
// after hydration the visitor's clock decides (no hydration mismatch, no effect).
export function CopyrightNotice({
  year,
  className,
  signClassName,
}: {
  year: number;
  className?: string;
  signClassName?: string;
}) {
  const t = useTranslations('footer');
  const current = useSyncExternalStore(
    noSubscribe,
    () => new Date().getFullYear(),
    () => year,
  );
  return (
    <p className={className}>
      {t.rich('copyright', {
        years: copyrightYears(current),
        sign: (chunks) => <span className={signClassName}>{chunks}</span>,
      })}
    </p>
  );
}
