'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  RAIL_ATTRIBUTE,
  RAIL_EVENT,
  RAIL_EXPANDED,
  RAIL_STORAGE_KEY,
  RAIL_WIDTHS,
  writeRailExpanded,
} from '@/lib/shell/rail';
import { ChevronLeftIcon, MenuIcon } from '../icons';
import styles from './shell.module.css';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readExpanded() {
  return document.documentElement.getAttribute(RAIL_ATTRIBUTE) === RAIL_EXPANDED;
}

function applyExpanded(expanded: boolean) {
  if (expanded) document.documentElement.setAttribute(RAIL_ATTRIBUTE, RAIL_EXPANDED);
  else document.documentElement.removeAttribute(RAIL_ATTRIBUTE);
  window.dispatchEvent(new Event(RAIL_EVENT));
}

function subscribe(onChange: () => void) {
  // Another tab changed the choice: follow it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === RAIL_STORAGE_KEY || event.key === null) {
      applyExpanded(event.newValue === RAIL_EXPANDED);
    }
  };
  window.addEventListener(RAIL_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(RAIL_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const isRail = () => window.matchMedia(RAIL_WIDTHS).matches;

type Tip = { label: string; top: number; left: number };

// Tablet rail (slice 5.26): the toggle at the top of the side menu expands the icon rail to
// icons and text, pushing the content, and collapses it again (also with Esc while focus is in
// the menu). The choice is remembered (lib/shell/rail.ts). While collapsed, hovering or focusing
// an icon shows its label beside the rail; the rail clips overflow, so the tip is fixed.
export function RailToggle({ controls }: { controls: string }) {
  const t = useTranslations('nav');
  const expanded = useSyncExternalStore(subscribe, readExpanded, () => false);
  const [tip, setTip] = useState<Tip | null>(null);

  const setExpanded = useCallback((value: boolean) => {
    applyExpanded(value);
    writeRailExpanded(storage(), value);
    setTip(null);
  }, []);

  useEffect(() => {
    const nav = document.getElementById(controls);
    if (!nav) return;
    const toggle = nav.querySelector<HTMLElement>('[data-rail-toggle]');

    const show = (target: EventTarget | null) => {
      if (!isRail() || readExpanded() || !(target instanceof Element)) return setTip(null);
      const item = target.closest<HTMLElement>('a, button');
      if (!item || !nav.contains(item)) return setTip(null);
      const label = item.getAttribute('aria-label') ?? item.textContent?.trim();
      if (!label) return setTip(null);
      const rect = item.getBoundingClientRect();
      setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') show(event.target);
    };
    const onFocusIn = (event: FocusEvent) => show(event.target);
    const hide = () => setTip(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setTip(null);
      if (isRail() && readExpanded()) {
        setExpanded(false);
        toggle?.focus();
      }
    };

    nav.addEventListener('pointerover', onPointerOver);
    nav.addEventListener('pointerleave', hide);
    nav.addEventListener('focusin', onFocusIn);
    nav.addEventListener('focusout', hide);
    nav.addEventListener('scroll', hide, { passive: true });
    nav.addEventListener('keydown', onKeyDown);
    return () => {
      nav.removeEventListener('pointerover', onPointerOver);
      nav.removeEventListener('pointerleave', hide);
      nav.removeEventListener('focusin', onFocusIn);
      nav.removeEventListener('focusout', hide);
      nav.removeEventListener('scroll', hide);
      nav.removeEventListener('keydown', onKeyDown);
    };
  }, [controls, setExpanded]);

  const label = expanded ? t('collapseMenu') : t('expandMenu');
  return (
    <>
      <button
        type="button"
        data-rail-toggle
        className={styles.railToggle}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-label={label}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronLeftIcon /> : <MenuIcon />}
      </button>
      {tip && (
        <span
          className={styles.railTip}
          style={{ top: tip.top, left: tip.left }}
          aria-hidden="true"
        >
          {tip.label}
        </span>
      )}
    </>
  );
}
