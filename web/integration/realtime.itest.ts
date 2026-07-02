/* ============================================================================
   Two-client Realtime + same-row optimistic-concurrency integration test.

   This talks to a REAL Supabase stack — it is deliberately NOT part of
   `npm run check` (file suffix `.itest.ts`, its own config, excluded from the
   app tsconfig/build). It only runs via `npm run test:integration` AND only
   when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise every case
   is skipped so it can never break normal CI or a production build.

   Isolation from real data:
     - every row it writes is tagged with a unique per-run marker (`zzitest-…`);
     - it tracks the ids it creates and deletes them in afterAll, plus a
       belt-and-suspenders cleanup of any leftover `zzitest-%` rows.
   Point it at your LOCAL stack (see docs/DEPLOY.md) — do not run against prod.

   What it proves:
     1. Realtime INSERT: client B sees a row client A inserts.
     2. Realtime UPDATE: client B sees a field client A changes.
     3. Optimistic concurrency: two clients holding the same `updated_at` both
        try to update the same row; the first wins, the second's update matches
        0 rows (the exact predicate AimProvider.syncTable uses to detect a
        conflict). No lost write.
   ========================================================================== */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!(URL && KEY);
const d = configured ? describe : describe.skip;

if (!configured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[itest] skipped — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local stack) to run. See docs/DEPLOY.md.',
  );
}

const MARK = `zzitest-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
const TABLE = 'trips';

type ChangePayload = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

async function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout waiting for realtime event');
}

function subscribed(client: SupabaseClient, name: string, onRow: (p: ChangePayload) => void) {
  const chan = client
    .channel(name)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (p) => onRow(p as unknown as ChangePayload));
  return new Promise<ReturnType<typeof client.channel>>((resolve, reject) => {
    chan.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve(chan);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`subscribe failed: ${status}`));
    });
  });
}

d('Realtime + optimistic concurrency (local Supabase)', () => {
  // Fallbacks keep construction from throwing when unconfigured; when the suite
  // is skipped these clients are never used.
  const A = createClient(URL ?? 'http://localhost:54321', KEY ?? 'anon', { auth: { persistSession: false } });
  const B = createClient(URL ?? 'http://localhost:54321', KEY ?? 'anon', { auth: { persistSession: false } });
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) await A.from(TABLE).delete().in('id', createdIds);
    await A.from(TABLE).delete().like('city', 'zzitest-%'); // sweep any strays
    await A.removeAllChannels();
    await B.removeAllChannels();
  });

  it('client B receives an INSERT made by client A', async () => {
    const seen: Record<string, unknown>[] = [];
    const chan = await subscribed(B, 'itest-insert', (p) => {
      if (p.eventType === 'INSERT' && p.new.city === `${MARK}-ins`) seen.push(p.new);
    });
    const { data, error } = await A.from(TABLE).insert({ section: 'upcoming', city: `${MARK}-ins` }).select().single();
    expect(error).toBeNull();
    createdIds.push((data as { id: string }).id);
    await waitFor(() => seen.length > 0);
    expect(seen[0].city).toBe(`${MARK}-ins`);
    await B.removeChannel(chan);
  }, 20000);

  it('client B receives an UPDATE made by client A', async () => {
    const { data } = await A.from(TABLE).insert({ section: 'upcoming', city: `${MARK}-upd` }).select().single();
    const id = (data as { id: string }).id;
    createdIds.push(id);
    const seen: Record<string, unknown>[] = [];
    const chan = await subscribed(B, 'itest-update', (p) => {
      if (p.eventType === 'UPDATE' && (p.new.id as string) === id) seen.push(p.new);
    });
    const { error } = await A.from(TABLE).update({ event: 'edited by A' }).eq('id', id);
    expect(error).toBeNull();
    await waitFor(() => seen.some((r) => r.event === 'edited by A'));
    await B.removeChannel(chan);
  }, 20000);

  it('rejects a stale same-row update (optimistic concurrency), no lost write', async () => {
    // Both clients "load" the row and remember its updated_at.
    const { data: row } = await A.from(TABLE).insert({ section: 'upcoming', city: `${MARK}-conflict`, event: 'orig' }).select().single();
    const r = row as { id: string; updated_at: string };
    createdIds.push(r.id);
    const known = r.updated_at;

    // Client A updates first, guarding on the known updated_at → succeeds, bumps updated_at.
    const { data: aRes } = await A.from(TABLE).update({ event: 'A wins' }).eq('id', r.id).eq('updated_at', known).select().maybeSingle();
    expect(aRes).not.toBeNull();
    expect((aRes as { updated_at: string }).updated_at).not.toBe(known);

    // Client B updates with the now-STALE updated_at → matches 0 rows (conflict).
    const { data: bRes, error: bErr } = await B.from(TABLE).update({ event: 'B loses' }).eq('id', r.id).eq('updated_at', known).select().maybeSingle();
    expect(bErr).toBeNull();
    expect(bRes).toBeNull(); // <- this is how AimProvider detects the conflict

    // The winning write is intact; B's write did not land.
    const { data: final } = await A.from(TABLE).select('event').eq('id', r.id).single();
    expect((final as { event: string }).event).toBe('A wins');
  }, 20000);
});
