'use client';

import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

// Link that marks itself as the current page; "/" only matches exactly.
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={className} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
