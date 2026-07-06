/**
 * Unique id for client-side keys AND optimistic rows we insert into Postgres.
 *
 * Every table's `id` column is `uuid` (see supabase/migrations/0001_init.sql),
 * and `AimProvider.syncTable` sends this id on INSERT (so the Realtime echo
 * matches the optimistic row on the same id). It therefore MUST be a valid
 * UUID — a `prefix_…` string is rejected by Postgres ("invalid input syntax
 * for type uuid") and the insert silently fails ("Could not save a new
 * record"). The `prefix` param is accepted for call-site compatibility but is
 * intentionally not prepended.
 */
export function uid(_prefix = 'id'): string {
  void _prefix;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback (no Web Crypto): RFC 4122 v4-shaped uuid so the value still casts.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
