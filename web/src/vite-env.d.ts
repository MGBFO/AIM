/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_AIM_DEMO?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by vite `define` at build time (see vite.config.ts).
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;
