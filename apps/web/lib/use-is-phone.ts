'use client';

import { useSyncExternalStore } from 'react';
import { isPhone, readDeviceTraits } from './orientation';

// Whether this device is a phone under the adaptive-game contract (`isPhone`, slice 5.34). Like the
// game inside the iframe, the answer is taken once and never changes while the page is open: the
// game keeps the shape it booted in, so the stage must keep it too. The server render (and so the
// first paint) says "not a phone"; a phone switches to its answer right after hydration.

const noSubscription = () => () => {};
let answer: boolean | undefined;

function snapshot(): boolean {
  if (answer === undefined) {
    const traits = readDeviceTraits();
    answer = traits ? isPhone(traits) : false;
  }
  return answer;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(noSubscription, snapshot, () => false);
}
