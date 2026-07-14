/* ============================================================================
   Per-user UI preferences (e.g. "Save View" filter selections). Stored server-
   side in the `user_prefs` table (one JSON blob per user, RLS-scoped to that
   user) so a user's preferences follow their login across devices/browsers.

   A localStorage copy is kept as an instant, offline cache so reads are
   synchronous (no flicker) and the app still works if the table doesn't exist
   yet or the network is down. `initUserPrefs` is awaited during app load
   (AimProvider) after the user is known, so modules read a warm cache.
   ========================================================================== */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

// The generated client type has no schema, so unknown tables resolve to `never`.
// Cast to a plain client (same pattern as AimProvider's `dyn`).
const db = supabase ? (supabase as unknown as SupabaseClient) : null;

type Prefs = Record<string, unknown>;

let uid: string | null = null;
let cache: Prefs = {};
let loaded = false;

const lsKey = () => `aim.userprefs.${uid ?? 'anon'}`;

function readLS(): Prefs {
  try {
    const raw = localStorage.getItem(lsKey());
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    /* ignore */
  }
  return {};
}
function writeLS(): void {
  try {
    localStorage.setItem(lsKey(), JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}
function ensure(): void {
  if (!loaded) { cache = readLS(); loaded = true; }
}

/**
 * Load the given user's preferences. Warms from localStorage immediately, then
 * reconciles with the server row if reachable. Safe to call with null (demo /
 * signed-out): uses localStorage only. Awaited during app init.
 */
export async function initUserPrefs(userId: string | null): Promise<void> {
  uid = userId;
  cache = readLS();
  loaded = true;
  if (db && uid) {
    try {
      const { data, error } = await db.from('user_prefs').select('value').eq('user_id', uid).maybeSingle();
      const value = (data as { value?: unknown } | null)?.value;
      if (!error && value && typeof value === 'object') {
        cache = value as Prefs;
        writeLS();
      }
    } catch {
      /* table missing / offline -> localStorage only */
    }
  }
}

export function getUserPref<T = unknown>(key: string): T | undefined {
  ensure();
  return cache[key] as T | undefined;
}

export function setUserPref(key: string, value: unknown): void {
  ensure();
  cache = { ...cache, [key]: value };
  writeLS();
  if (db && uid) {
    void db
      .from('user_prefs')
      .upsert({ user_id: uid, value: cache }, { onConflict: 'user_id' })
      .then(({ error }) => { if (error) console.error('user_prefs upsert', error); });
  }
}
