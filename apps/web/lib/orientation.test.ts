import { describe, expect, it, vi } from 'vitest';
import { lockLandscape, locksInFullscreen, unlockOrientation } from './orientation';

describe('locksInFullscreen', () => {
  it('locks landscape games only', () => {
    expect(locksInFullscreen('landscape')).toBe(true);
    expect(locksInFullscreen('portrait')).toBe(false);
    expect(locksInFullscreen('any')).toBe(false);
  });
});

describe('lockLandscape', () => {
  it('asks the browser for landscape', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    await expect(lockLandscape({ lock })).resolves.toBe(true);
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('reports a refused lock (iOS Safari, desktop) without throwing', async () => {
    const lock = vi.fn().mockRejectedValue(new DOMException('not supported', 'NotSupportedError'));
    await expect(lockLandscape({ lock })).resolves.toBe(false);
  });

  it('does nothing where the API is missing', async () => {
    await expect(lockLandscape({})).resolves.toBe(false);
    await expect(lockLandscape(undefined)).resolves.toBe(false);
  });
});

describe('unlockOrientation', () => {
  it('releases the lock and never throws', () => {
    const unlock = vi.fn();
    unlockOrientation({ unlock });
    expect(unlock).toHaveBeenCalled();
    expect(() =>
      unlockOrientation({
        unlock: () => {
          throw new Error('no lock');
        },
      }),
    ).not.toThrow();
    expect(() => unlockOrientation(undefined)).not.toThrow();
  });
});
