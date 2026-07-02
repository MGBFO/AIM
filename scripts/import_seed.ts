/**
 * import_seed.ts — load scripts/seed.json into Postgres (Supabase).
 *
 * One-time cutover, but idempotent / re-runnable: it deletes existing rows from
 * the operational tables and re-inserts from the seed. Uses the SERVICE-ROLE
 * key (bypasses RLS) — server-side only, NEVER shipped to the browser.
 *
 * Env (see .env.example): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Run:  npm run seed:import        (from repo root)
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = join(HERE, 'seed.json');
const REFERENCE = join(HERE, 'seed.reference.json');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// ─── normalization helpers (kept in sync with web/src/lib) ───────────────────
const MON_MAP: Record<string, string> = {
  'Mike G.': 'Mike Gregory', MG: 'Mike Gregory', Mike: 'Mike Gregory',
  'Jack G.': 'Jack Griffin', JG: 'Jack Griffin', Jack: 'Jack Griffin',
  'Harrison F.': 'Harrison Fritz', HF: 'Harrison Fritz', Harrison: 'Harrison Fritz',
  Intern: 'Intern',
};
const APPROVED = new Set(['Unassigned', 'Mike Gregory', 'Jack Griffin', 'Harrison Fritz', 'Intern']);

function normLevel(raw: unknown): 'Level 1' | 'Level 2' | 'Level 3' {
  const s = String(raw ?? '').replace('BFO - ', '').trim();
  const m = s.match(/Level\s*([123])/i);
  return (m ? (`Level ${m[1]}`) : 'Level 1') as 'Level 1' | 'Level 2' | 'Level 3';
}
function levelDays(level: string): number {
  return level === 'Level 1' ? 90 : level === 'Level 2' ? 180 : 365;
}
function normAnalyst(raw: unknown): string {
  if (raw == null) return 'Unassigned';
  const t = String(raw).trim();
  if (t === '') return 'Unassigned';
  if (APPROVED.has(t)) return t;
  return MON_MAP[t] ?? 'Unassigned';
}
/** Only real yyyy-mm-dd strings reach a `date` column; 'Q2'/'Q3' etc → null. */
function isoDateOrNull(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function num(v: unknown): number | null {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

interface Seed {
  travel: Record<string, unknown>[];
  monitoring: Record<string, unknown>[];
  prcArchive: Record<string, unknown>[];
  prcSchedule: Record<string, unknown>[];
  prcEntities: unknown[];
  prcMapping: Record<string, unknown>;
}

function loadSeed(): Seed {
  const path = existsSync(SEED) ? SEED : REFERENCE;
  console.log(`seed source: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function wipe(table: string) {
  // delete all rows (re-runnable). gte on created_at matches every row.
  const { error } = await db.from(table).delete().gte('created_at', '1970-01-01');
  if (error) throw new Error(`wipe ${table}: ${error.message}`);
}
async function insert(table: string, rows: unknown[]) {
  if (!rows.length) return;
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  console.log(`  ${table}: ${rows.length} rows`);
}

async function main() {
  const seed = loadSeed();
  console.log('importing…');

  for (const t of ['tasks', 'trips', 'monitoring', 'prc_schedule', 'prc_archive', 'prc_config']) {
    await wipe(t);
  }

  await insert('trips', seed.travel.map((t) => ({
    section: t.section ?? 'upcoming',
    date: isoDateOrNull(t.date),
    days: num(t.days),
    city: t.city ?? null,
    analyst: t.analyst ?? null, // raw multi-analyst code preserved
    monitoring_visits: t.monitoringVisits ?? null,
    event: t.event ?? null,
    flight: num(t.flight),
    hotel: num(t.hotel),
    car: num(t.car),
    notes_other_visits: t.notesOtherVisits ?? null,
    permanent: false,
  })));

  await insert('monitoring', seed.monitoring.map((m) => {
    const level = normLevel(m.level);
    const l1 = level === 'Level 1';
    return {
      fund: m.fund ?? '',
      analyst: normAnalyst(m.analyst),
      level,
      most_recent: isoDateOrNull(m.mostRecent),
      monitoring_date: isoDateOrNull(m.monitoringDate),
      status: 'Not Started',
      annual_onsite: l1,
      compliance_check: l1,
      target_monitoring_days: levelDays(level),
      archived: false,
    };
  }));

  await insert('prc_schedule', seed.prcSchedule.map((r) => ({
    presentation: r.presentation,
    most_recent: isoDateOrNull(r.mostRecent),
    projected_next: isoDateOrNull(r.projectedNext),
    macro: r.macro ?? '',
    act40: r.act40 ?? '',
    hedge_fund: r.hedgeFund ?? '',
    private: r.private ?? '',
    new_funds: r.newFunds != null ? String(r.newFunds) : '',
  })));

  await insert('prc_archive', seed.prcArchive.map((r) => ({
    meeting_date: isoDateOrNull(r.meetingDate),
    macro: r.macro ?? '',
    presentation: r.presentation ?? null,
    act40: r.act40 ?? '',
    hedge_fund: r.hedgeFund ?? '',
    private: r.private ?? '',
    new_funds: r.newFunds ?? '',
    sharepoint_url: null,
  })));

  await insert('prc_config', [
    { key: 'mapping', value: seed.prcMapping ?? {} },
    { key: 'entities', value: seed.prcEntities ?? [] },
  ]);

  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
