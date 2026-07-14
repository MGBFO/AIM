/**
 * Apply supabase/migrations/*.sql to a hosted Supabase project via the
 * Management API (POST /v1/projects/{ref}/database/query), authenticated with a
 * personal ACCESS TOKEN. This avoids needing the database password / connection
 * pooler. Used by the Stage 2 GitHub Actions workflow.
 *
 * Env: SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN
 * Idempotent: if the schema is already present (public.trips exists), it skips.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN.');
  process.exit(1);
}
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSql(sql) {
  // Retry transient network / 5xx errors (the Management API occasionally
  // returns a short-lived 500, e.g. an internal cache OOM).
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      if (res.status >= 500) throw new Error(`transient HTTP ${res.status}: ${text}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`); // 4xx: real error, don't retry
      return text;
    } catch (e) {
      lastErr = e;
      const retriable = /transient HTTP 5\d\d/.test(e.message) || e.name === 'TypeError';
      if (!retriable || attempt === 6) throw e;
      const wait = attempt * 3000;
      console.log(`  transient error (attempt ${attempt}/6), retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'supabase', 'migrations');

const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) {
  console.error('No migration files found.');
  process.exit(1);
}
const numPrefix = (f) => parseInt((f.match(/^(\d+)/) || [])[1] || '0', 10);

// Incremental, idempotent migration tracking. Each applied file is recorded in
// _aim_migrations so re-runs only apply what's new.
try {
  await runSql('create table if not exists public._aim_migrations (name text primary key, applied_at timestamptz not null default now())');

  const appliedOut = await runSql('select name from public._aim_migrations');
  const parseRows = (out) => { try { const p = JSON.parse(out); return Array.isArray(p) ? p : p.result || []; } catch { return []; } };
  let applied = new Set(parseRows(appliedOut).map((r) => r.name));

  // Bootstrap for databases created before tracking existed: if nothing is
  // recorded yet but the core schema is present (public.trips), assume the
  // original schema migrations (<= 0005) were already applied and record them,
  // so we don't try to re-run them.
  if (applied.size === 0) {
    const tripsOut = await runSql("select to_regclass('public.trips') as t");
    const tripsPresent = parseRows(tripsOut)[0] && parseRows(tripsOut)[0].t != null;
    if (tripsPresent) {
      const baseline = files.filter((f) => numPrefix(f) <= 5);
      for (const f of baseline) {
        const esc = f.replace(/'/g, "''");
        await runSql(`insert into public._aim_migrations(name) values('${esc}') on conflict do nothing`);
      }
      applied = new Set(baseline);
      console.log(`Bootstrapped tracking with ${baseline.length} pre-existing migration(s).`);
    }
  }

  const pending = files.filter((f) => !applied.has(f));
  if (!pending.length) {
    console.log('No new migrations to apply.');
    process.exit(0);
  }
  for (const f of pending) {
    process.stdout.write(`Applying ${f} … `);
    await runSql(readFileSync(join(migDir, f), 'utf8'));
    const esc = f.replace(/'/g, "''");
    await runSql(`insert into public._aim_migrations(name) values('${esc}') on conflict do nothing`);
    console.log('ok');
  }
  console.log(`Applied ${pending.length} migration(s).`);
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
}
