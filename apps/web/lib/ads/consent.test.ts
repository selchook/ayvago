import { describe, expect, it, vi } from 'vitest';
import { openGooglePrivacyOptions } from './consent';

describe("openGooglePrivacyOptions (Google's CMP settings on the privacy page)", () => {
  it('queues the revocation message, so it works while the CMP is still loading', () => {
    const win = {} as Window & {
      googlefc?: { callbackQueue?: Array<() => void>; showRevocationMessage?: () => void };
    };
    openGooglePrivacyOptions(win);
    expect(win.googlefc?.callbackQueue).toHaveLength(1);
    // The CMP loads later and runs the queue.
    const show = vi.fn();
    win.googlefc!.showRevocationMessage = show;
    win.googlefc!.callbackQueue!.forEach((fn) => fn());
    expect(show).toHaveBeenCalledOnce();
  });

  it('adds to the queue of a CMP that is already there', () => {
    const existing = vi.fn();
    const show = vi.fn();
    const win = {
      googlefc: { callbackQueue: [existing], showRevocationMessage: show },
    } as unknown as Window;
    openGooglePrivacyOptions(win);
    const fc = (win as unknown as { googlefc: { callbackQueue: Array<() => void> } }).googlefc;
    expect(fc.callbackQueue).toHaveLength(2);
    fc.callbackQueue[1]!();
    expect(show).toHaveBeenCalledOnce();
  });

  it('does nothing harmful when the CMP never loads (ads off)', () => {
    const win = {} as Window;
    expect(() => openGooglePrivacyOptions(win)).not.toThrow();
  });
});
