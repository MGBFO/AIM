import { defineConfig } from 'vitest/config';

// Integration tests run against a REAL local Supabase stack and are kept out of
// the default `npm run test` / `npm run check` runs. Node environment (uses the
// global WebSocket in Node 22 for Realtime); no jsdom, no setup file.
export default defineConfig({
  test: {
    include: ['integration/**/*.itest.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
