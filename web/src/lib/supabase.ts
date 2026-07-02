import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced loudly in dev; the app cannot talk to the DB without these.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to web/.env.local and fill in from `supabase status`.',
  );
}

/**
 * The browser client uses the ANON key only. All access is gated by
 * Row-Level Security. The service-role key must NEVER reach the frontend.
 */
export const supabase = createClient<Database>(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});
