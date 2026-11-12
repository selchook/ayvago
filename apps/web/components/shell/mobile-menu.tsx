'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { DRAWER_WIDTHS, isCloseSwipe } from '@/lib/shell/rail';
import { CloseIcon, MenuIcon } from '../icons';
import styles from './shell.module.css';

const DRAWER_ID = 'menu-drawer';
/** Set on <html> while the drawer is open: locks the page scroll (shell.module.css). */
const OPEN_ATTRIBUTE = 'data-drawer-open';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Phone menu (slice 5.26): the top bar's menu button opens the side menu as a drawer from the
// left, a modal <dialog> over a dimmed backdrop. The rest of the page, a running game's iframe
// included, is inert while it is open; nothing here listens while it is closed. It closes on
// the backdrop, the close button, Esc, a chosen link and a left swipe, and gives focus back to
// the menu button.
export function MobileMenu({ logo, children }: { logo: ReactNode; children: ReactNode }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);

  const openDrawer = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.removeAttribute('data-closing');
    dialog.showModal();
    document.documentElement.setAttribute(OPEN_ATTRIBUTE, '');
    setOpen(true);
    closeRef.current?.focus();
  };

  // Plays the slide-out, then closes; at once under reduced motion or when `instant`.
  const closeDrawer = useCallback((instant = false) => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    if (instant || reducedMotion()) {
      dialog.removeAttribute('data-closing');
      dialog.close();
      return;
    }
    if (dialog.hasAttribute('data-closing')) return;
    dialog.setAttribute('data-closing', '');
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      dialog.removeEventListener('animationend', finish);
      if (!dialog.hasAttribute('data-closing')) return;
      dialog.removeAttribute('data-closing');
      dialog.close();
    };
    dialog.addEventListener('animationend', finish);
    // In case the animation never runs (a hidden tab, an unsupported browser).
    timer = window.setTimeout(finish, 400);
  }, []);

  // A link to another page closes the drawer; so does growing past phone width (a rotated
  // phone gets the rail instead).
  useEffect(() => {
    closeDrawer(true);
  }, [pathname, closeDrawer]);

  useEffect(() => {
    const phone = window.matchMedia(DRAWER_WIDTHS);
    const onChange = () => {
      if (!phone.matches) closeDrawer(true);
    };
    phone.addEventListener('change', onChange);
    return () => {
      phone.removeEventListener('change', onChange);
      document.documentElement.removeAttribute(OPEN_ATTRIBUTE);
    };
  }, [closeDrawer]);

  const onClose = () => {
    document.documentElement.removeAttribute(OPEN_ATTRIBUTE);
    setOpen(false);
    // Only when the button is still shown; the drawer also closes when the screen grows.
    if (buttonRef.current?.offsetParent) buttonRef.current.focus();
  };

  const onClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    const target = event.target as Element;
    // The panel fills the dialog, so a click on the dialog itself is a click on the backdrop.
    if (target === event.currentTarget) return closeDrawer();
    // A chosen link (also the current page's) or "Install the app", which opens its banner.
    if (target.closest('nav a, nav button, [data-drawer-home]')) closeDrawer();
  };

  // Keeps Tab and Shift+Tab inside the drawer.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (item) => item.offsetParent !== null || item === document.activeElement,
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchRef.current;
    const touch = event.changedTouches[0];
    touchRef.current = null;
    if (start && touch && isCloseSwipe(touch.clientX - start.x, touch.clientY - start.y)) {
      closeDrawer();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-label={t('openMenu')}
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        aria-haspopup="dialog"
        onClick={openDrawer}
      >
        <MenuIcon size={24} />
      </button>
      <dialog
        ref={dialogRef}
        id={DRAWER_ID}
        className={styles.drawer}
        aria-label={t('menu')}
        onCancel={(event) => {
          // Esc: slide out like every other way of closing.
          event.preventDefault();
          closeDrawer();
        }}
        onClose={onClose}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className={styles.drawerPanel}>
          <div className={styles.drawerHead}>
            <Link href="/" className={styles.drawerLogo} data-drawer-home>
              {logo}
            </Link>
            <button
              ref={closeRef}
              type="button"
              className={styles.menuButton}
              aria-label={t('closeMenu')}
              onClick={() => closeDrawer()}
            >
              <CloseIcon size={24} />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
