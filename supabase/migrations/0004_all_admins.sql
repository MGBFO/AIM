-- ============================================================================
-- Decision (2026-07-02): treat all authenticated users as admins. Everyone gets
-- full read/write/delete on every table. We keep the `role` column and the
-- admin-gated policies from 0002 intact, and simply make is_admin() true for any
-- authenticated user — so the existing policies now grant everyone full access.
-- (Revisit here if per-role restrictions are reintroduced later.)
-- ============================================================================

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null;
$$;

-- Reflect the decision in the data: new and existing users are admins.
alter table users alter column role set default 'admin';
update users set role = 'admin' where role <> 'admin';

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'admin')
  on conflict (id) do nothing;
  return new;
end;
$$;
