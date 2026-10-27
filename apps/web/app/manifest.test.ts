import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('web app manifest', () => {
  const m = manifest();

  it('meets the install criteria', () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons?.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('points at icons that exist in public/', () => {
    for (const icon of m.icons ?? []) {
      expect(existsSync(join(__dirname, '..', 'public', icon.src)), icon.src).toBe(true);
    }
  });

  it('ships the service worker and its offline page', () => {
    expect(existsSync(join(__dirname, '..', 'public', 'sw.js'))).toBe(true);
    expect(existsSync(join(__dirname, '..', 'public', 'offline.html'))).toBe(true);
  });
});
