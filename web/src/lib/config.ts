/* Runtime mode. When no Supabase URL is configured (or VITE_AIM_DEMO=1), the app
   runs in local DEMO mode: seeded from the reference data, persisted to the
   browser, no auth/backend. With Supabase env vars set, it uses the real
   multi-user backend. */
export const DEMO =
  !import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_AIM_DEMO === '1';

export const DEMO_STORAGE_KEY = 'aim.demo.v1';
