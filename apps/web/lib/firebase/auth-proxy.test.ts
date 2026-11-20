import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authProxyOrigin, authProxyRewrites } from './auth-proxy';

// proxy.ts imports next-intl's middleware, which needs the Next.js runtime: read its matcher.
const MATCHER = /matcher: '(.+)'/
  .exec(readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8'))![1]!
  .replace(/\\\\/g, '\\');

describe('auth domain proxy', () => {
  it('accepts only Firebase Hosting origins', () => {
    expect(authProxyOrigin('https://ayvago-prod.firebaseapp.com')).toBe(
      'https://ayvago-prod.firebaseapp.com',
    );
    expect(authProxyOrigin(' https://Ayvago-Prod.web.app/ ')).toBe('https://ayvago-prod.web.app');
    for (const value of [
      undefined,
      '',
      'ayvago-prod.firebaseapp.com',
      'http://ayvago-prod.firebaseapp.com',
      'https://evil.example.com',
      'https://ayvago-prod.firebaseapp.com.evil.com',
      'https://ayvago-prod.firebaseapp.com/__/auth',
    ]) {
      expect(authProxyOrigin(value)).toBeNull();
    }
  });

  it('proxies the auth handler and the init file, or nothing', () => {
    expect(authProxyRewrites(null)).toEqual([]);
    expect(authProxyRewrites('https://ayvago-prod.firebaseapp.com')).toEqual([
      {
        source: '/__/auth/:path*',
        destination: 'https://ayvago-prod.firebaseapp.com/__/auth/:path*',
      },
      {
        source: '/__/firebase/init.json',
        destination: 'https://ayvago-prod.firebaseapp.com/__/firebase/init.json',
      },
    ]);
  });

  it('keeps the locale middleware away from the proxied paths', () => {
    const matcher = new RegExp(`^${MATCHER}$`);
    expect(matcher.test('/__/auth/handler')).toBe(false);
    expect(matcher.test('/__/auth/iframe')).toBe(false);
    expect(matcher.test('/__/firebase/init.json')).toBe(false);
    // pages still get their locale
    expect(matcher.test('/profile')).toBe(true);
    expect(matcher.test('/en/privacy')).toBe(true);
    expect(matcher.test('/')).toBe(true);
  });
});
