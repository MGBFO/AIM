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

async function runSql(sql) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'supabase', 'migrations');

// Guard: skip if already migrated so re-runs are safe.
try {
  const out = await runSql("select to_regclass('public.trips') as t");
  let present = false;
  try {
    const parsed = JSON.parse(out);
    const rows = Array.isArray(parsed) ? parsed : parsed.result || [];
    present = rows[0] && rows[0].t != null;
  } catch { /* fall through to apply */ }
  if (present) {
    console.log('Schema already present (public.trips exists) — skipping migrations.');
    process.exit(0);
  }
} catch (e) {
  console.error('Could not reach the Supabase Management API:', e.message);
  process.exit(1);
}

const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) {
  console.error('No migration files found.');
  process.exit(1);
}
for (const f of files) {
  process.stdout.write(`Applying ${f} … `);
  try {
    await runSql(readFileSync(join(migDir, f), 'utf8'));
    console.log('ok');
  } catch (e) {
    console.error('FAILED\n' + e.message);
    process.exit(1);
  }
}
console.log(`All ${files.length} migrations applied.`);
