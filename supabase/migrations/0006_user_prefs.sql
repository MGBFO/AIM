-- ============================================================================
-- Per-user UI preferences (e.g. "Save View" filter selections). One JSON blob
-- per user, readable/writable only by that user. This is client UI state, not
-- shared operational data — kept separate from the shared tables.
-- ============================================================================
create table if not exists user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_prefs enable row level security;

-- Each user sees and edits only their own row.
drop policy if exists user_prefs_own on user_prefs;
create policy user_prefs_own on user_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists t_user_prefs_updated on user_prefs;
create trigger t_user_prefs_updated before update on user_prefs
  for each row execute function set_updated_at();
