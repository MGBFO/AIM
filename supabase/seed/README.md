# Seeding

AIM's seed data is **derived from the three source spreadsheets**, not stored as
static SQL, so seeding is a two-step data pipeline rather than a `seed.sql`:

1. `python3 scripts/build_seed.py` — reads `scripts/source/*.xlsx` with
   `openpyxl(data_only=True)` and writes `scripts/seed.json`.
   (A canonical `scripts/seed.reference.json`, extracted from the legacy
   single-file build, is committed as the authoritative fallback and the
   validation target for `--validate`.)
2. `npm run seed:import` — runs `scripts/import_seed.ts`, which loads the seed
   into Postgres using the **service-role** key (bypasses RLS; server-side only).
   Idempotent / re-runnable: it wipes and re-inserts the operational tables.

Schema itself lives in `../migrations/` and is applied by `supabase db reset`.
