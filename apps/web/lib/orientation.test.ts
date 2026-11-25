import { describe, expect, it, vi } from 'vitest';
import {
  artOrientation,
  isPhone,
  lockLandscape,
  locksInFullscreen,
  MOBILE_QUERY,
  PHONE_MAX_SHORT_SIDE,
  readDeviceTraits,
  stageOrientation,
  unlockOrientation,
} from './orientation';

// The adaptive-game contract shared with the studio (slice 5.34, docs/adr/0029): a phone is a
// touch-first device (no hover, coarse pointer) whose screen's short side is under 600 px.
describe('isPhone', () => {
  it('keeps the contract with the studio', () => {
    expect(MOBILE_QUERY).toBe('(hover: none) and (pointer: coarse)');
    expect(PHONE_MAX_SHORT_SIDE).toBe(600);
  });

  it('is true for touch-first screens under 600 px on the short side, held either way', () => {
    expect(isPhone({ mobile: true, screenWidth: 390, screenHeight: 844 })).toBe(true); // iPhone 13
    expect(isPhone({ mobile: true, screenWidth: 844, screenHeight: 390 })).toBe(true); // sideways
    expect(isPhone({ mobile: true, screenWidth: 412, screenHeight: 915 })).toBe(true); // Pixel
    expect(isPhone({ mobile: true, screenWidth: 599, screenHeight: 1000 })).toBe(true);
  });

  it('is false for tablets: a short side of 600 px or more', () => {
    expect(isPhone({ mobile: true, screenWidth: 600, screenHeight: 960 })).toBe(false);
    expect(isPhone({ mobile: true, screenWidth: 810, screenHeight: 1080 })).toBe(false); // iPad
    expect(isPhone({ mobile: true, screenWidth: 1080, screenHeight: 810 })).toBe(false);
  });

  it('is false for desktops, small windows and touch laptops with a mouse included', () => {
    expect(isPhone({ mobile: false, screenWidth: 1440, screenHeight: 900 })).toBe(false);
    expect(isPhone({ mobile: false, screenWidth: 390, screenHeight: 844 })).toBe(false);
  });
});

describe('readDeviceTraits', () => {
  it('has nothing to read on the server', () => {
    expect(readDeviceTraits()).toBeNull();
  });

  it('reads the media query and the screen size in a browser', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('window', { matchMedia });
    vi.stubGlobal('screen', { width: 390, height: 844 });
    try {
      expect(readDeviceTraits()).toEqual({ mobile: true, screenWidth: 390, screenHeight: 844 });
      expect(matchMedia).toHaveBeenCalledWith(MOBILE_QUERY);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('stageOrientation', () => {
  it('runs adaptive games portrait on a phone and landscape on desktops and tablets', () => {
    expect(stageOrientation('any', true)).toBe('portrait');
    expect(stageOrientation('any', false)).toBe('landscape');
  });

  it('keeps portrait and landscape games as they are on every device', () => {
    for (const phone of [true, false]) {
      expect(stageOrientation('portrait', phone)).toBe('portrait');
      expect(stageOrientation('landscape', phone)).toBe('landscape');
    }
  });
});

describe('artOrientation', () => {
  it('treats adaptive games art as landscape (the studio captures it so)', () => {
    expect(artOrientation('any')).toBe('landscape');
    expect(artOrientation('landscape')).toBe('landscape');
    expect(artOrientation('portrait')).toBe('portrait');
  });
});

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
