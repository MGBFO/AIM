import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The browser client uses the ANON key only. All access is gated by
 * Row-Level Security. The service-role key must NEVER reach the frontend.
 *
 * In local DEMO mode (no env configured) there is no backend, so this stays
 * null and is never touched — the app uses the in-browser demo store instead.
 */
export const supabase: SupabaseClient<Database> =
  url && anonKey
    ? createClient<Database>(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : (null as unknown as SupabaseClient<Database>);
