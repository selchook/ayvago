'use client';

import { useEffect } from 'react';

// The top-bar popovers (theme, language, account) are <details data-popover>. This keeps at
// most one open: opening one closes the others, and a click or tap anywhere outside the open
// one, or Escape, closes it.
export function PopoverCloser() {
  useEffect(() => {
    const openPopovers = () =>
      Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-popover][open]'));

    // `toggle` does not bubble, so listen in the capture phase.
    const onToggle = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLDetailsElement) || !target.open) return;
      if (!target.hasAttribute('data-popover')) return;
      for (const other of openPopovers()) if (other !== target) other.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      for (const popover of openPopovers()) {
        if (!target || !popover.contains(target)) popover.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      for (const popover of openPopovers()) {
        popover.open = false;
        if (popover.contains(document.activeElement)) popover.querySelector('summary')?.focus();
      }
    };

    document.addEventListener('toggle', onToggle, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('toggle', onToggle, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  return null;
}
