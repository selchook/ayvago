import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests run in Node. Component tests render to static markup (react-dom/server), so they need
// the React JSX runtime (tsconfig keeps JSX for Next) and the `@/` path alias.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
});
