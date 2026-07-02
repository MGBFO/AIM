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

## Get a shareable app link (one-click deploy, no terminal)

To hand a non-technical tester a real hosted URL, deploy to a static host. A
signed-in team/IT member clicks once — no terminal, no local setup.

- **Demo mode (fastest, for user acceptance testing):** deploy with **no** env
  vars. The hosted app runs fully client-side on seeded sample data (data saved
  in each tester's browser). Good for clicking through every module and add/edit/
  delete. Multi-user/shared data/realtime are *not* active in this mode.
- **Full mode (multi-user):** set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
  in the host and connect a Supabase project — see [`docs/DEPLOY.md`](./docs/DEPLOY.md).

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/mgbfo/aim)
&nbsp;
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mgbfo/aim)

Build settings are pre-committed (`netlify.toml`, `vercel.json`): build
`npm run build`, publish `web/dist`. After it deploys, share the host's URL.
User-testing steps are in [`docs/UAT.md`](./docs/UAT.md).

## Quick look — demo mode (no backend, ~1 min)
Just want to click through the app? With **no** Supabase configured it runs in
local **demo mode**: seeded from the reference data, stored in your browser, no
login. Needs only Node 22.
```bash
npm install
npm run dev        # open http://127.0.0.1:5173
```
A "Demo mode — data is stored locally in your browser" toast confirms it. Edits,
undo/redo, import/export all work; **Sign out** resets the local demo data.
Realtime/multi-user needs the real backend below. (Demo activates whenever
`VITE_SUPABASE_URL` is unset; set that var to use Supabase instead.)

## Getting started (local, offline, full backend)
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

## Deploy
Managed Supabase + static host (Vercel/Netlify). See [`docs/DEPLOY.md`](./docs/DEPLOY.md).

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
