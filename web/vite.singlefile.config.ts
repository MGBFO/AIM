import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the whole app (demo mode) into ONE self-contained index.html — all JS
// and CSS inlined, assets as data URIs, no external requests. Used to publish a
// clickable hosted preview. Normal `npm run build` (vite.config.ts) is unchanged
// and still produces the multi-chunk build for real deployment.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-single',
    // singlefile needs everything in one chunk
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
