'use client';

import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

// Link that marks itself as the current page; "/" only matches exactly. `label` names the link
// where its text may be hidden (the collapsed tablet rail shows icons only).
export function NavLink({
  href,
  className,
  label,
  children,
}: {
  href: string;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={className}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
