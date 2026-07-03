/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
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
