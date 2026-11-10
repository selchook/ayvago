import { describe, expect, it } from 'vitest';
import { callableBody, runClock } from './run-clock';

describe('runClock', () => {
  it('counts only the time the page was visible', () => {
    const clock = runClock(1_000, false);
    expect(clock.visibleMs(4_000)).toBe(3_000);
    clock.setHidden(true, 5_000);
    // hidden for an hour: nothing added
    expect(clock.visibleMs(3_605_000)).toBe(4_000);
    clock.setHidden(false, 3_605_000);
    clock.setHidden(false, 3_606_000); // a repeated event changes nothing
    expect(clock.visibleMs(3_607_000)).toBe(6_000);
  });

  it('starts paused when the run began in a hidden page', () => {
    const clock = runClock(0, true);
    expect(clock.visibleMs(10_000)).toBe(0);
    clock.setHidden(true, 11_000);
    clock.setHidden(false, 20_000);
    expect(clock.visibleMs(25_000)).toBe(5_000);
  });
});

describe('callableBody', () => {
  it('wraps the data like the callable SDK', () => {
    expect(JSON.parse(callableBody({ sessionId: 'abc', durationMs: 5 }))).toEqual({
      data: { sessionId: 'abc', durationMs: 5 },
    });
  });
});
