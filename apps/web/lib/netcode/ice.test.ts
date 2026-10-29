import { describe, expect, it } from 'vitest';
import { createRateLimiter, hasTurn, parseCloudflareIce, withoutPort53 } from './ice';

describe('ICE servers', () => {
  it('tells whether a TURN server is in the list', () => {
    expect(hasTurn([{ urls: 'stun:stun.cloudflare.com:3478' }])).toBe(false);
    expect(hasTurn([])).toBe(false);
    expect(
      hasTurn([
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
      ]),
    ).toBe(true);
    expect(hasTurn([{ urls: 'turn:turn.cloudflare.com:3478?transport=udp' }])).toBe(true);
  });

  it('drops port 53 URLs and empty servers', () => {
    expect(
      withoutPort53([
        { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
        { urls: 'turn:turn.cloudflare.com:53?transport=udp', username: 'u', credential: 'c' },
        { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
      ]),
    ).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ]);
  });

  it("reads Cloudflare's response", () => {
    const body = {
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' },
      ],
    };
    expect(parseCloudflareIce(body)).toHaveLength(2);
    expect(parseCloudflareIce({ iceServers: { urls: 'stun:x:3478' } })).toEqual([
      { urls: ['stun:x:3478'] },
    ]);
    expect(parseCloudflareIce({})).toBeNull();
    expect(parseCloudflareIce(null)).toBeNull();
  });

  it('limits requests per key and window', () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 10)).toBe(true);
    expect(allow('a', 20)).toBe(false);
    expect(allow('b', 20)).toBe(true);
    expect(allow('a', 1500)).toBe(true);
  });
});
