# Analysis in Motion (AIM)

Biltmore Family Office's internal investment-analyst workflow app, being
re-platformed from a single-file React/`localStorage` build into a multi-user
web app: **Vite + React + TypeScript** frontend on a **Supabase** backend
(Postgres + Auth + Realtime + RLS).

The legacy build in `reference/Analysis_in_Motion_V5.html` is the functional
spec. See [`CLAUDE.md`](./CLAUDE.md) for the operating manual and conventions.

## Prerequisites
- Node 22 (`.nvmrc`) and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker (for the local DB stack)
- Python 3.11+ with `openpyxl` (only to regenerate the seed from the xlsx)

## Getting started (local, offline)
```bash
npm install                      # installs web workspace + tooling
cp .env.example web/.env.local   # then fill in from `supabase status`

supabase start                   # boots Postgres/Auth/Realtime/Studio in Docker
supabase db reset                # applies supabase/migrations/

npm run seed:build               # xlsx -> scripts/seed.json  (optional; reference seed is committed)
npm run seed:import              # seed.json -> Postgres (needs SUPABASE_SERVICE_ROLE_KEY)

npm run dev                      # Vite dev server at http://127.0.0.1:5173
```

## Validate
```bash
npm run check   # typecheck + lint + test + build — the bar for every version
```

## Layout
| Path | What |
| --- | --- |
| `web/` | Vite + React + TS frontend (`src/lib`, `src/hooks`, `src/components`, `src/modules`, `src/styles`) |
| `supabase/migrations/` | SQL schema + RLS + realtime — source of truth for the DB |
| `scripts/build_seed.py` | xlsx → `scripts/seed.json` (openpyxl `data_only=True`) |
| `scripts/import_seed.ts` | `seed.json` → Postgres (service-role, idempotent) |
| `scripts/source/` | the three source spreadsheets |
| `reference/` | the legacy single-file build (the spec) |

## Security
The frontend uses the **anon key + RLS only**. The **service-role key** is used
solely by the one-time seed import and must never be bundled into the browser
or committed. Copy secrets into `web/.env.local` (gitignored).
