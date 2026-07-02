# CLAUDE.md — Analysis in Motion (AIM)

## What AIM is
Biltmore Family Office's internal investment-analyst workflow app. Six modules
(fixed nav order): **Dashboard, Travel Schedule, Monitoring Process, Portfolio
Research Committee (PRC), Analyst Bandwidth, Workflow Calendar**. We are
**re-platforming** the legacy single-file build (`reference/Analysis_in_Motion_V5.html`,
React 18 + Babel-standalone + `localStorage`) into a real multi-user web app.
That HTML file is the **functional spec** — port behavior 1:1 unless told otherwise.
This is not a redesign; keep the look, feel, and every feature.

## Tech stack
- **Frontend:** Vite + React 18 + TypeScript (`web/`). Port the six modules JSX→TSX.
- **Backend:** Supabase — managed Postgres + Auth + Realtime + Row-Level Security.
  No hand-written CRUD server; the client uses `@supabase/supabase-js`.
- **System of record:** Postgres (the legacy `aim.v2.state` JSON blob is normalized
  into tables). `localStorage` is only for client UI prefs (active filters,
  selected module), never data.
- **Realtime:** Supabase Realtime subscriptions so edits appear on others' screens live.
- **Auth:** Supabase Auth (email/password; Google SSO pending — see Open items).
  Roles: `admin`, `analyst`.

## Repo layout
```
web/                Vite + React + TS frontend
  src/lib/          supabase client, dates, sort, roster, types
  src/hooks/        useTrips, useMonitoring, useTasks, useRealtime, useUndo … (later)
  src/components/   shared UI (Modal, Confirm, Toast, DateCell, SortHeader …) (later)
  src/modules/      Dashboard, Travel, Monitoring, PRC, Bandwidth, Calendar (later)
  src/styles/tokens.css   design system, ported verbatim from the HTML
supabase/migrations/  SQL schema + RLS + realtime (source of truth for the DB)
scripts/build_seed.py   xlsx → scripts/seed.json (openpyxl, data_only=True)
scripts/import_seed.ts  seed.json → Postgres (service-role, idempotent)
scripts/source/         the three source .xlsx
reference/              the legacy single-file build (the spec)
```

## Commands
- `npm run dev` — Vite dev server (web workspace).
- `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build`.
- `npm run check` — all four; **green is the bar for every version**.
- `npm run db:start` / `db:stop` / `db:reset` — local Supabase stack (needs CLI + Docker).
- `npm run seed:build` — regenerate `scripts/seed.json` from the xlsx.
- `npm run seed:import` — load the seed into Postgres (needs `SUPABASE_SERVICE_ROLE_KEY`).

### Local bootstrap (offline)
1. `cp .env.example web/.env.local` and fill from `supabase status`.
2. `npm install` · `supabase start` · `supabase db reset` (applies migrations).
3. `npm run seed:build && npm run seed:import`. Then `npm run dev`.

## Analyst roster & naming rules
Canonical order (drives Bandwidth cards & pickers): **Unassigned, Mike Gregory,
Jack Griffin, Harrison Fritz, Intern**. Codes: `MG`/`JG`/`HF`. Any unknown analyst
value (Team, All, RG, blank, …) normalizes to **Unassigned**. See `web/src/lib/roster.ts`.

## Always do (conventions — do not relearn)
- **Local dates, no UTC drift.** Store as Postgres `date`; on the wire use local
  ISO `yyyy-mm-dd`. Never `new Date(isoString)` for a date-only value. Route
  through `parseLocalDate`/`toISO` in `web/src/lib/dates.ts`. All dates render `mm/dd/yyyy`.
- **Entity cells are slash-separated, never comma-separated** (e.g. `ETIHX/IPAY`).
- **openpyxl uses `data_only=True`** so cached date formulas (`=E-90`, `=D+365`) resolve.
- **Legacy value migrations:** `Team → Unassigned`, `Portfolio Research Committee → PRC`,
  strip `BFO - ` prefixes from monitoring levels.
- **Never ship the service-role key.** Frontend uses the anon key + RLS only.
- **Column sort cycle** asc→desc→off; nulls/blanks last (`web/src/lib/sort.ts`).
- **Task dedupe** on `source_module + source_id` while `status='open'`.
- Compact, content-sized filter ribbons (not full-width). Match `tokens.css`.

## Working style
- Feedback is batched & versioned (V1, V2, …). Build incrementally per round;
  don't pause for multi-question clarifications — ask only when a behavior truly
  can't be built without the answer. Prefer targeted edits over rewrites on mature
  modules. Every version is a git commit; tag milestones.

## Delivery sequencing
1. **(done)** Scaffold + CLAUDE.md + local Supabase + schema migration + seed. ← review here
2. Auth + RLS + app shell (header, nav, tokens, Toast/Modal/Confirm, DateCell, SortHeader).
3. Read-only port of all six modules against seeded data.
4. Editing + Realtime + optimistic concurrency, module by module.
5. Scoped undo/redo (confirm semantics first), bulk actions, import/export.
6. Deploy config + docs.

## Open items (need a human decision — ask, don't assume)
- **Hosting/compliance:** managed Supabase vs. self-hosted on-prem?
- **SSO:** email/password only, or Google Workspace / other?
- **Undo semantics:** confirm per-user scoped undo (via `action_log`) before building.
  Replaces the legacy global whole-state snapshot (unsafe with multiple users).
- **Roster/roles:** exact `admin` vs `analyst` write/delete permissions per table.
  Current RLS in `0002_rls.sql` is a starting default, not final.
