# Deploying AIM

Target: **managed Supabase** (Postgres + Auth + Realtime) + a **static frontend
host** (Vercel or Netlify). Hosting is environment-config only, so switching
hosts — or moving to self-hosted Supabase later — is just changing env values.

## 1. Supabase project (backend)

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
