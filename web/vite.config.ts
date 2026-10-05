/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build stamp injected at build time so the running version is verifiable in
// the app. Prefer the CI commit (GITHUB_SHA / VERCEL / Netlify), else fall back
// to the local git short SHA.
const buildCommit =
  (process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || '').slice(0, 7) ||
  (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; } })();
const buildTime = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  // On GitHub Pages the app is served under /<repo>/ (e.g. /AIM/). The Pages
  // workflow sets PAGES_BASE=/AIM/; everywhere else (dev, Vercel/Netlify, demo)
  // it stays "/".
  base: process.env.PAGES_BASE || '/',
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ['xlsx'], // heavy; only used by Monitoring import/export
          vendor: ['react', 'react-dom', '@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
