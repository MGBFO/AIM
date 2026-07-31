-- ============================================================================
-- New Calls: a record created when an analyst completes a "New Calls" task.
-- Captures who/when so the Dashboard can aggregate per-analyst counts by year.
-- Shared operational data (all authenticated users read/write; delete = admin),
-- consistent with the other operational tables.
-- ============================================================================
create table if not exists new_calls (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references tasks(id) on delete set null,
  name       text not null default '',
  call_date  date,
  analysts   text[] not null default array[]::text[],
  year       integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

alter table new_calls enable row level security;
create policy new_calls_select on new_calls for select to authenticated using (true);
create policy new_calls_insert on new_calls for insert to authenticated with check (true);
create policy new_calls_update on new_calls for update to authenticated using (true) with check (true);
create policy new_calls_delete on new_calls for delete to authenticated using (is_admin());

drop trigger if exists t_new_calls_updated on new_calls;
create trigger t_new_calls_updated before update on new_calls
  for each row execute function set_updated_at();

alter table new_calls replica identity full;
alter publication supabase_realtime add table new_calls;
