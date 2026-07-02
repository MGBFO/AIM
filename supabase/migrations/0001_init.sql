-- ============================================================================
-- AIM initial schema. Normalizes the legacy single `aim.v2.state` JSON blob
-- into relational tables. Source of truth for the database.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ─── enums ──────────────────────────────────────────────────────────────────
create type role as enum ('admin', 'analyst');
create type trip_section as enum ('upcoming', 'potential', 'archived');
create type monitoring_level as enum ('Level 1', 'Level 2', 'Level 3');
create type task_status as enum ('open', 'completed');
create type action_op as enum ('insert', 'update', 'delete');

-- ─── shared: updated_at trigger + updated_by helper ──────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── users (mirrors auth.users) ──────────────────────────────────────────────
create table users (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         role not null default 'analyst',
  analyst_code text,               -- 'MG' | 'JG' | 'HF' | ...
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger t_users_updated before update on users
  for each row execute function set_updated_at();

-- Convenience: is the current auth user an admin?
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin');
$$;

-- Auto-provision a users row when an auth user is created.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger t_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ─── trips ───────────────────────────────────────────────────────────────────
create table trips (
  id                  uuid primary key default gen_random_uuid(),
  section             trip_section not null default 'upcoming',
  date                date,
  days                numeric,
  city                text,
  analyst             text,          -- raw multi-analyst code preserved (slash-joined)
  monitoring_visits   text,
  event               text,
  flight              numeric,
  hotel               numeric,
  car                 numeric,
  notes_other_visits  text,
  permanent           boolean not null default false,
  permanent_origin_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references users(id)
);
create trigger t_trips_updated before update on trips
  for each row execute function set_updated_at();
create index idx_trips_section_date on trips (section, date);

-- ─── monitoring ───────────────────────────────────────────────────────────────
create table monitoring (
  id                     uuid primary key default gen_random_uuid(),
  fund                   text not null default '',
  analyst                text not null default 'Unassigned',
  level                  monitoring_level not null default 'Level 1',
  most_recent            date,
  monitoring_date        date,
  status                 text not null default 'Not Started',
  annual_onsite          boolean not null default false,
  compliance_check       boolean not null default false,
  target_monitoring_days integer not null default 90,
  archived               boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references users(id)
);
create trigger t_monitoring_updated before update on monitoring
  for each row execute function set_updated_at();
create index idx_monitoring_level_date on monitoring (level, monitoring_date);
create index idx_monitoring_archived on monitoring (archived);

-- ─── prc_schedule ─────────────────────────────────────────────────────────────
create table prc_schedule (
  id             uuid primary key default gen_random_uuid(),
  presentation   text not null,
  most_recent    date,          -- may be computed from archive
  projected_next date,
  macro          text,
  act40          text,          -- slash-joined entities
  hedge_fund     text,
  private        text,
  new_funds      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references users(id)
);
create trigger t_prc_schedule_updated before update on prc_schedule
  for each row execute function set_updated_at();
create index idx_prc_schedule_next on prc_schedule (projected_next);

-- ─── prc_archive ──────────────────────────────────────────────────────────────
create table prc_archive (
  id             uuid primary key default gen_random_uuid(),
  meeting_date   date,
  macro          text,
  presentation   text,
  act40          text,
  hedge_fund     text,
  private        text,
  new_funds      text,
  sharepoint_url text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references users(id)
);
create trigger t_prc_archive_updated before update on prc_archive
  for each row execute function set_updated_at();
create index idx_prc_archive_date on prc_archive (meeting_date);

-- ─── prc_config (keyed singletons: entities grid, mapping object) ────────────
create table prc_config (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,   -- 'entities' | 'mapping'
  value      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);
create trigger t_prc_config_updated before update on prc_config
  for each row execute function set_updated_at();

-- ─── tasks ────────────────────────────────────────────────────────────────────
create table tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null default '',
  description         text,
  analysts            text[] not null default array['Unassigned']::text[],
  label               text,
  due_date            date,
  recurrence_type     text,
  recurrence_interval integer,
  recurrence_unit     text,
  status              task_status not null default 'open',
  source_module       text,
  source_id           text,
  completed_at        timestamptz,
  completed_history   jsonb not null default '[]'::jsonb,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references users(id)
);
create trigger t_tasks_updated before update on tasks
  for each row execute function set_updated_at();
create index idx_tasks_due_date on tasks (due_date);
create index idx_tasks_status on tasks (status);
-- Dedupe guard for pushed tasks (source_module + source_id) while open.
create unique index uq_tasks_open_source on tasks (source_module, source_id)
  where status = 'open' and source_module is not null and source_id is not null;

-- ─── action_log (per-user scoped undo/redo) ──────────────────────────────────
create table action_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  table_name text not null,
  row_id     uuid not null,
  op         action_op not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index idx_action_log_user on action_log (user_id, created_at desc);

-- ─── app_config (singletons like mon_rollover) ───────────────────────────────
create table app_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);
create trigger t_app_config_updated before update on app_config
  for each row execute function set_updated_at();
