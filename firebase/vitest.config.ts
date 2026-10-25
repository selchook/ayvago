import { defineConfig } from 'vitest/config';

// Rules and Cloud Functions tests share one set of emulators and clear Firestore between tests,
// so test files run one after another.
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 20_000, hookTimeout: 30_000 },
});
