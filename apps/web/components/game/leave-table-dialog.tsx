'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import styles from './game.module.css';

/**
 * What leaving means right now (slice 5.20): a free seat at a waiting table, a waiting table
 * handed to another player or closed because the host was alone, or a game the others play on.
 */
export type LeaveMode = 'seat' | 'host' | 'close' | 'game';

/**
 * "Leave table?" confirmation. A native modal dialog: the page behind it is inert, so the focus
 * stays inside; Escape and a click on the backdrop mean "Stay". The focus starts on "Stay".
 */
export function LeaveTableDialog({
  open,
  mode,
  busy,
  failed,
  onLeave,
  onStay,
}: {
  open: boolean;
  mode: LeaveMode;
  busy: boolean;
  failed: boolean;
  onLeave: () => void;
  onStay: () => void;
}) {
  const t = useTranslations('table.leave');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      stayRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.leaveDialog}
      aria-labelledby="leave-table-title"
      aria-describedby="leave-table-body"
      data-leave-dialog={mode}
      onCancel={(event) => {
        // Escape: the dialog closes through `open`, so React stays the one source of truth.
        event.preventDefault();
        if (!busy) onStay();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onStay();
      }}
    >
      <div className={styles.leaveDialogBody}>
        <h2 id="leave-table-title">{mode === 'game' ? t('titleGame') : t('titleTable')}</h2>
        <p id="leave-table-body">{t(`body.${mode}`)}</p>
        {failed ? <p role="alert">{t('failed')}</p> : null}
        <div className={styles.leaveDialogActions}>
          <button
            ref={stayRef}
            type="button"
            className={styles.seatAction}
            data-tone="quiet"
            disabled={busy}
            onClick={onStay}
          >
            {t('stay')}
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onLeave}
            data-leave-confirm
          >
            {busy ? t('leaving') : t('confirm')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
