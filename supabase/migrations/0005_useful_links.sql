-- ============================================================================
-- useful_links — Dashboard "Useful Links" panel (name, login, password, url,
-- notes). Present in the legacy state but not in the original data-model list.
-- Internal tool: passwords stored as-is, same as the legacy build. All
-- authenticated users have full access (all-admin decision) + realtime.
-- ============================================================================

create table useful_links (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  login      text,
  password   text,
  url        text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);
create trigger t_useful_links_updated before update on useful_links
  for each row execute function set_updated_at();

alter table useful_links enable row level security;
create policy useful_links_select on useful_links for select to authenticated using (true);
create policy useful_links_insert on useful_links for insert to authenticated with check (true);
create policy useful_links_update on useful_links for update to authenticated using (true) with check (true);
create policy useful_links_delete on useful_links for delete to authenticated using (is_admin());

alter table useful_links replica identity full;
alter publication supabase_realtime add table useful_links;
