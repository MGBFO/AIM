# Deploying AIM

Target: **managed Supabase** (Postgres + Auth + Realtime) + a **static frontend
host** (Vercel or Netlify). Hosting is environment-config only, so switching
hosts — or moving to self-hosted Supabase later — is just changing env values.

---

## 0. Acceptance gate — local smoke-run (do this first)

Run the whole stack locally against a fresh DB and click through every module
before any cloud deploy. Requires the Supabase CLI + Docker.

```bash
cp .env.example web/.env.local          # then paste values from `supabase status`
npm install
supabase start                          # boots Postgres/Auth/Realtime/Studio in Docker
supabase db reset                       # applies ALL migrations in supabase/migrations/
npm run seed:build                      # xlsx -> scripts/seed.json (optional; reference seed is committed)

# Copy the two values printed by `supabase status` (API URL + service_role key):
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key from `supabase status`>"
npm run seed:import

npm run dev                             # http://127.0.0.1:5173
```

`supabase status` prints the **API URL**, **anon key**, and **service_role key**.
Put the API URL + anon key in `web/.env.local` (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`); the service_role key is only for the seed import
(`SUPABASE_SERVICE_ROLE_KEY`) above and the integration test below.

### Click-through checklist (expected results)
1. **Login** — the app opens on the sign-in card. Click **"Need an account? Sign up"**,
   create a user, then sign in. → Header appears with your email and **Sign out**.
2. **Dashboard** — Most Recent / Next trips tables populated; Monitoring quarter
   table shows counts; PRC "Next Projected Meeting" card filled. Add a Useful Link
   → row appears; **Show/Hide** toggles the password; **Open ↗** opens the URL.
3. **Travel** — Upcoming / Potential / Archived sections have rows; ★ marks
   permanent trips. Select an upcoming row → **Add to Analyst Bandwidth** →
   success toast; a second click on the same row → "Task already exists for this
   source." Edit a date inline → persists.
4. **Monitoring** — rows grouped Level 1→3, oldest Monitoring Date first, blanks
   last; overdue rows render red (`mon-ovr`). Inline change Status→Completed with
   a Monitoring Date set → Most Recent/Monitoring Date advance. Select 2+ rows →
   **Bulk Edit**. **Import XLSX** with `scripts/source/Monitoring.xlsx` → the
   diagnostics modal reports rows imported. **Export** downloads a CSV.
5. **PRC** — Meeting Schedule + Archive render; edit a Projected Next date inline;
   **Mapping** and **Fund List** popups open; delete a stored Sharepoint URL.
6. **Analyst Bandwidth** — per-analyst cards; Period filter defaults to **Current
   Month**; summary cards reflect the filtered set; completing a Recurring task
   advances its due date.
7. **Workflow Calendar** — month grid with multi-day travel bars + task chips;
   click a chip to edit, a bar to see trip detail.
8. **Realtime (two browsers)** — open the app in two windows signed in as two
   users. Edit a row in one → it updates in the other within ~1s, no refresh.
9. **Undo/redo** — make an edit, press **Ctrl+Z** (or the ↶ button) → it reverts;
   **Ctrl+Y** / ↷ re-applies. While typing in a field, Ctrl+Z does native text
   undo (does not trigger app undo).

### Expected console / behavior — and what's a real problem
- **OK / expected:** brief "Loading data…" on first paint; a Realtime
  `SUBSCRIBED` channel; a **"This record was just updated by someone else —
  reloaded."** toast if two users edit the *same* row at once (that's the
  optimistic-concurrency guard working, not a bug).
- **Investigate:** `Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY` in the
  console → `web/.env.local` isn't set/loaded (restart `npm run dev` after
  editing it). Empty modules → the seed import didn't run or failed. A red
  **error-boundary panel** ("Something failed to load") → a real module error;
  capture the console stack. Repeated conflict toasts on *single-user* edits →
  the row's `updated_at` isn't advancing (check the `set_updated_at` trigger).
- **Gate:** zero uncaught console errors and no error-boundary across all six
  modules = acceptance passed.

## 0b. Automated integration test (two-client Realtime + conflict)

`web/integration/realtime.itest.ts` verifies Realtime propagation and the
same-row conflict against a **real local stack**. It is isolated: excluded from
`npm run check`, opt-in via env vars, tags its rows with a unique `zzitest-…`
marker, and deletes them in teardown. **Run it against your local stack only.**

```bash
supabase start   # if not already running
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key from `supabase status`>"
npm run test:integration
```

Expected: **3 passed** —
(1) client B receives A's INSERT, (2) client B receives A's UPDATE,
(3) a stale same-row update matches 0 rows (conflict) with no lost write.
With no env vars set it prints `[itest] skipped …` and exits 0 (never fails CI).
If it hangs on subscribe, confirm the tables are in the `supabase_realtime`
publication (they are via `0003_realtime.sql` / `0005_useful_links.sql`) and that
`supabase start` is healthy.

---

## Stage 2 — browser-only backend setup (no terminal)

Once you create a Supabase project and paste six values into GitHub, one workflow
button applies the database, seeds test data, runs the technical tests, and
redeploys the app in real-backend mode. No local commands.

### Step 1 — create the project + copy six values (Supabase dashboard)
Create a project at **supabase.com** (pick a strong **database password** and
save it). Then collect:

| # | Value | Where in Supabase | Sensitive? |
|---|-------|-------------------|------------|
| 1 | **Reference ID** (project ref) | Project Settings → General → "Reference ID" | Public |
| 2 | **Project URL** (`https://<ref>.supabase.co`) | Project Settings → API → "Project URL" | Public |
| 3 | **anon public** key | Project Settings → API → Project API keys → `anon` `public` | Public (safe to ship in the browser) |
| 4 | **service_role** key | Project Settings → API → Project API keys → `service_role` | **SENSITIVE** |
| 5 | **database password** | the one you set at creation (or Settings → Database → Reset password) | **SENSITIVE** |
| 6 | **access token** | supabase.com/dashboard/account/tokens → Generate new token | **SENSITIVE** |

### Step 2 — paste them into GitHub (repo → Settings → Secrets and variables → Actions)
Two tabs on that page. **Names must match exactly.**

**"Variables" tab → New repository variable** (public config):
- `SUPABASE_PROJECT_REF` = value 1
- `VITE_SUPABASE_URL` = value 2
- `VITE_SUPABASE_ANON_KEY` = value 3

**"Secrets" tab → New repository secret** (sensitive — masked, never shown again):
- `SUPABASE_SERVICE_ROLE_KEY` = value 4
- `SUPABASE_DB_PASSWORD` = value 5
- `SUPABASE_ACCESS_TOKEN` = value 6

> Why the split: 1–3 are public by design (the URL and anon key already ship in
> the browser app and are safe behind row-level security). 4–6 can administer or
> bypass the database, so they go in Secrets and are never exposed.

### Step 3 — run it (one button)
Repo → **Actions** tab → left sidebar **"Stage 2 — Supabase backend, seed, tests,
go live"** → **Run workflow** → branch `claude/aim-claude-code-migration-xrkf0l`
→ **Run workflow**.

It runs three stages in order: apply migrations → seed test data → technical
tests → (only if tests pass) redeploy the app in real-backend mode.

### Step 4 — read the result
- **Green check** on the run = **Stage 2 passed**: database live, data seeded,
  realtime + concurrency verified, and **https://mgbfo.github.io/AIM/** now opens
  a **login screen** (real multi-user app).
- **Red ✗** = failed. Click the run; the failed job's name says which stage:
  `migrate-seed` (DB/secrets), `technical-tests` (backend behavior), or
  `deploy-full` (publish). Send the run link and I'll fix it.

### After go-live (real backend mode)
- The site now requires an account. Sign up with email/password. Supabase may
  require email confirmation — click the emailed link, or disable
  **Authentication → Providers → Email → "Confirm email"** in Supabase for easy
  testing.
- The seeded rows are **test data**. Before production, restrict sign-ups (or add
  SSO) and re-seed/clear as needed — every authenticated user is currently an admin.
- Re-running the workflow is safe (migrations skip already-applied; seed wipes +
  reloads the test data).

---

## 1. Supabase project (backend) — CLI reference (optional)

1. Create a project at supabase.com. Note the **Project URL**, **anon key**, and
   **service-role key** (Project Settings → API).
2. Link the CLI and push the schema:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push          # applies supabase/migrations/ (schema, RLS, realtime)
   ```
3. Confirm **Realtime** is on for the app tables (the migrations add them to the
   `supabase_realtime` publication) and **Email** auth is enabled
   (Authentication → Providers). Set the Site URL / redirect URLs to your
   frontend origin.
4. Seed the shared database once (service-role key bypasses RLS):
   ```bash
   npm run seed:build        # optional; regenerates scripts/seed.json from the xlsx
   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<service-role> npm run seed:import
   ```
   The service-role key is used **only** here — never in the frontend or in CI
   that builds the frontend.

## 2. Frontend (Vercel)

`vercel.json` builds `web/` and serves `web/dist` with an SPA fallback.

1. Import the repo in Vercel.
2. Set env vars (Production + Preview):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. Deploy. Vercel runs `npm run build` and publishes `web/dist`.

### Netlify (alternative)
`netlify.toml` mirrors the same build/publish/redirect. Set the same two
`VITE_*` env vars in the Netlify dashboard.

## 3. First users

Users self-serve via the Login screen (Sign up → Sign in). A row in `public.users`
is auto-created by the `handle_new_user` trigger; per the current decision every
authenticated user is an **admin** (full read/write/delete). Tighten
`supabase/migrations/0004_all_admins.sql` if role-based limits are reintroduced.

## Security checklist
- Frontend ships the **anon key only**; all access is gated by RLS.
- The **service-role key** appears only in the one-time seed import — never in
  `VITE_*` vars, the bundle, or build logs.
- `.env*` files are gitignored; set secrets in the host's dashboard.

## Self-hosted Supabase (if compliance later requires on-prem)
Run the Supabase Docker stack on internal infra, apply the same
`supabase/migrations/`, and point the two `VITE_*` vars (and the seed import env)
at that instance. No app code changes are required.
