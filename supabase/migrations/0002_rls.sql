-- ============================================================================
-- Row-Level Security. STARTING POLICY — exact per-table write/delete rules are
-- an open item pending sign-off (see CLAUDE.md "Open items"). Defaults here:
--   * All authenticated team members can read + insert + update shared
--     operational data (trips, monitoring, prc_schedule, prc_archive, tasks).
--   * Only admins can DELETE from operational tables (delete-archive) and can
--     read/write prc_config, users, and app_config.
--   * action_log rows are owned by their author (each user sees/writes own).
-- The frontend uses the anon key + RLS only; the service-role key (seed import)
-- bypasses RLS and must never ship to the browser.
-- ============================================================================

alter table users        enable row level security;
alter table trips        enable row level security;
alter table monitoring   enable row level security;
alter table prc_schedule enable row level security;
alter table prc_archive  enable row level security;
alter table prc_config   enable row level security;
alter table tasks        enable row level security;
alter table action_log   enable row level security;
alter table app_config   enable row level security;

-- ─── users ────────────────────────────────────────────────────────────────
-- Everyone authenticated can read the roster; a user may update their own row;
-- admins manage all rows.
create policy users_select on users for select to authenticated using (true);
create policy users_update_self on users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from users where id = auth.uid()));
create policy users_admin_all on users for all to authenticated
  using (is_admin()) with check (is_admin());

-- ─── operational tables: read+insert+update for all, delete admin-only ──────
do $$
declare t text;
begin
  foreach t in array array['trips','monitoring','prc_schedule','prc_archive','tasks']
  loop
    execute format('create policy %I_select on %I for select to authenticated using (true);', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (true);', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (true) with check (true);', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (is_admin());', t, t);
  end loop;
end $$;

-- ─── prc_config: read for all, write admin-only ─────────────────────────────
create policy prc_config_select on prc_config for select to authenticated using (true);
create policy prc_config_admin_write on prc_config for all to authenticated
  using (is_admin()) with check (is_admin());

-- ─── app_config: read for all, write admin-only ─────────────────────────────
create policy app_config_select on app_config for select to authenticated using (true);
create policy app_config_admin_write on app_config for all to authenticated
  using (is_admin()) with check (is_admin());

-- ─── action_log: each user reads/writes only their own audit rows ───────────
create policy action_log_own_select on action_log for select to authenticated
  using (user_id = auth.uid());
create policy action_log_own_insert on action_log for insert to authenticated
  with check (user_id = auth.uid());
create policy action_log_own_delete on action_log for delete to authenticated
  using (user_id = auth.uid());
