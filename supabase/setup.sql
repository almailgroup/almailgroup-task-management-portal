-- ---------------------------------------------------------------------------
-- Almailgroup Task Management Portal — complete database setup
--
-- GENERATED FILE. Do not edit by hand: run `npm run db:bundle` instead.
-- Source of truth is supabase/migrations/, concatenated here in filename order.
--
-- First-time setup: paste this whole file into the Supabase SQL editor and
-- run it. It is safe to re-run; every statement is idempotent.
--
-- Bundled migrations:
--   20260913000001_initial_schema.sql
--   20260913000002_functions_and_triggers.sql
--   20260913000003_row_level_security.sql
--   20260913000004_realtime.sql
--   20260913000005_protect_last_admin.sql
-- ---------------------------------------------------------------------------

-- =========================================================================
-- 20260913000001_initial_schema.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Almailgroup Task Management Portal — core schema
--
-- Creates the enums, tables and indexes backing projects, tasks, assignments,
-- comments and the task audit trail.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('admin', 'manager', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- profiles — one row per auth user, created automatically on signup.
-- --------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null,
  full_name   text,
  avatar_url  text,
  role        public.user_role not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_email_not_blank check (length(btrim(email)) > 0),
  constraint profiles_full_name_length check (full_name is null or length(full_name) <= 120)
);

create unique index if not exists profiles_email_key
  on public.profiles (lower(email));

comment on table public.profiles is
  'Application profile for each auth.users row. Role drives authorisation.';

-- --------------------------------------------------------------------------
-- projects
--
-- created_by is nullable with ON DELETE SET NULL so that offboarding a user
-- never cascades away the projects they happened to create.
-- --------------------------------------------------------------------------

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint projects_name_length check (length(btrim(name)) between 1 and 120),
  constraint projects_description_length check (description is null or length(description) <= 2000)
);

create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists projects_created_at_idx on public.projects (created_at desc);

-- --------------------------------------------------------------------------
-- tasks
--
-- `position` gives the Kanban board a stable, persistable order within each
-- status column. Cards are inserted using the midpoint between neighbours so a
-- single drag updates exactly one row.
-- --------------------------------------------------------------------------

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid        not null references public.projects (id) on delete cascade,
  title       text        not null,
  description text,
  status      public.task_status   not null default 'todo',
  priority    public.task_priority not null default 'medium',
  due_date    date,
  position    double precision not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tasks_title_length check (length(btrim(title)) between 1 and 200),
  constraint tasks_description_length check (description is null or length(description) <= 20000)
);

create index if not exists tasks_project_status_position_idx
  on public.tasks (project_id, status, position);
create index if not exists tasks_project_created_idx
  on public.tasks (project_id, created_at desc);
-- Overdue lookups only ever consider unfinished work.
create index if not exists tasks_open_due_date_idx
  on public.tasks (due_date)
  where status <> 'done' and due_date is not null;

-- --------------------------------------------------------------------------
-- task_assignments — many-to-many between tasks and profiles.
-- --------------------------------------------------------------------------

create table if not exists public.task_assignments (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),

  primary key (task_id, user_id)
);

create index if not exists task_assignments_user_idx
  on public.task_assignments (user_id);

-- --------------------------------------------------------------------------
-- comments — contextual discussion on a task, streamed over Realtime.
-- --------------------------------------------------------------------------

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comments_content_length check (length(btrim(content)) between 1 and 5000)
);

create index if not exists comments_task_created_idx
  on public.comments (task_id, created_at);

-- --------------------------------------------------------------------------
-- task_activity — append-only audit trail, written by triggers.
--
-- `action` is text with a check rather than an enum so new activity kinds can
-- ship without an enum migration.
-- --------------------------------------------------------------------------

create table if not exists public.task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  field      text,
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now(),

  constraint task_activity_action_known check (
    action in (
      'created',
      'updated',
      'status_changed',
      'priority_changed',
      'due_date_changed',
      'assignee_added',
      'assignee_removed',
      'commented'
    )
  )
);

create index if not exists task_activity_task_created_idx
  on public.task_activity (task_id, created_at desc);

comment on table public.task_activity is
  'Append-only audit log. Written by triggers; never updated or deleted by the app.';

-- =========================================================================
-- 20260913000002_functions_and_triggers.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Functions and triggers
--
-- Every helper is SECURITY DEFINER with a pinned search_path. That combination
-- is what lets the RLS policies in the next migration read `profiles.role`
-- without recursing into the policy that guards `profiles` itself.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Authorisation helpers
-- --------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

comment on function public.current_user_role() is
  'Role of the calling user. SECURITY DEFINER so RLS on profiles does not recurse.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() in ('admin', 'manager'), false);
$$;

-- True when the caller created the task or is assigned to it.
create or replace function public.can_edit_task(task uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = task
      and (
        t.created_by = auth.uid()
        or exists (
          select 1 from public.task_assignments a
          where a.task_id = t.id and a.user_id = auth.uid()
        )
      )
  );
$$;

-- --------------------------------------------------------------------------
-- Signup — mirror every new auth user into public.profiles.
--
-- The first account to register becomes the admin, so a fresh deployment is
-- not locked out of project creation.
-- --------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assigned_role public.user_role;
begin
  select case when count(*) = 0 then 'admin'::public.user_role
              else 'member'::public.user_role end
    into assigned_role
  from public.profiles;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    assigned_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- updated_at maintenance
-- --------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- Role escalation guard
--
-- `profiles` is writable by its owner so people can edit their own name and
-- avatar. This trigger makes sure that same policy cannot be used to hand
-- yourself the admin role — only an existing admin may change `role`.
-- --------------------------------------------------------------------------

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a profile role'
      using errcode = 'insufficient_privilege';
  end if;

  -- id and email track auth.users and are not user-editable.
  new.id := old.id;
  new.email := old.email;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- --------------------------------------------------------------------------
-- Task audit trail
-- --------------------------------------------------------------------------

create or replace function public.log_task_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.task_activity (task_id, actor_id, action, new_value)
  values (new.id, auth.uid(), 'created', new.title);
  return null;
end;
$$;

drop trigger if exists tasks_log_insert on public.tasks;
create trigger tasks_log_insert
  after insert on public.tasks
  for each row execute function public.log_task_insert();

create or replace function public.log_task_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if new.status is distinct from old.status then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (new.id, actor, 'status_changed', 'status', old.status::text, new.status::text);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (new.id, actor, 'priority_changed', 'priority', old.priority::text, new.priority::text);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (new.id, actor, 'due_date_changed', 'due_date', old.due_date::text, new.due_date::text);
  end if;

  if new.title is distinct from old.title then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (new.id, actor, 'updated', 'title', old.title, new.title);
  end if;

  -- Body text is logged as a change marker only; the diff itself would bloat
  -- the audit table.
  if new.description is distinct from old.description then
    insert into public.task_activity (task_id, actor_id, action, field)
    values (new.id, actor, 'updated', 'description');
  end if;

  return null;
end;
$$;

drop trigger if exists tasks_log_update on public.tasks;
create trigger tasks_log_update
  after update on public.tasks
  for each row execute function public.log_task_update();

create or replace function public.log_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
  label  text;
begin
  target := case when tg_op = 'INSERT' then new.user_id else old.user_id end;

  select coalesce(p.full_name, p.email) into label
  from public.profiles p where p.id = target;

  if tg_op = 'INSERT' then
    insert into public.task_activity (task_id, actor_id, action, field, new_value)
    values (new.task_id, auth.uid(), 'assignee_added', 'assignees', label);
  else
    insert into public.task_activity (task_id, actor_id, action, field, old_value)
    values (old.task_id, auth.uid(), 'assignee_removed', 'assignees', label);
  end if;

  return null;
end;
$$;

drop trigger if exists task_assignments_log_insert on public.task_assignments;
create trigger task_assignments_log_insert
  after insert on public.task_assignments
  for each row execute function public.log_assignment_change();

drop trigger if exists task_assignments_log_delete on public.task_assignments;
create trigger task_assignments_log_delete
  after delete on public.task_assignments
  for each row execute function public.log_assignment_change();

create or replace function public.log_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.task_activity (task_id, actor_id, action)
  values (new.task_id, new.user_id, 'commented');
  return null;
end;
$$;

drop trigger if exists comments_log_insert on public.comments;
create trigger comments_log_insert
  after insert on public.comments
  for each row execute function public.log_comment_insert();

-- =========================================================================
-- 20260913000003_row_level_security.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Authorisation model: this is a single-tenant internal portal, so every
-- signed-in employee can READ the whole workspace (that is what makes project
-- switching, assignee pickers and @mentions work). WRITES are what the roles
-- gate:
--
--   admin   — everything, including roles and deletions
--   manager — create/edit/delete projects and any task
--   member  — create tasks; edit tasks they created or are assigned to
--
-- Nothing is readable while signed out: read policies target `authenticated`
-- AND require a JWT subject, so a role without an identity reads nothing.
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_assignments enable row level security;
alter table public.comments        enable row level security;
alter table public.task_activity   enable row level security;

-- Force RLS to apply to table owners too, so a mistake in a SECURITY DEFINER
-- function cannot quietly hand out unrestricted access.
alter table public.profiles        force row level security;
alter table public.projects        force row level security;
alter table public.tasks           force row level security;
alter table public.task_assignments force row level security;
alter table public.comments        force row level security;
alter table public.task_activity   force row level security;

-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (auth.uid() is not null);

-- Own row only. The guard_profile_role_change trigger blocks self-promotion.
drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "admins update any profile" on public.profiles;
create policy "admins update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT policy: rows are created exclusively by the handle_new_user
-- trigger on auth.users. No DELETE policy: profiles die with their auth user.

-- --------------------------------------------------------------------------
-- projects
-- --------------------------------------------------------------------------

drop policy if exists "projects are readable by authenticated users" on public.projects;
create policy "projects are readable by authenticated users"
  on public.projects for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "managers and admins create projects" on public.projects;
create policy "managers and admins create projects"
  on public.projects for insert
  to authenticated
  with check (public.is_manager_or_admin() and created_by = auth.uid());

drop policy if exists "managers and admins update projects" on public.projects;
create policy "managers and admins update projects"
  on public.projects for update
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- Deleting a project cascades to its tasks, so it stays with admins and the
-- manager who created it.
drop policy if exists "admins and owning managers delete projects" on public.projects;
create policy "admins and owning managers delete projects"
  on public.projects for delete
  to authenticated
  using (
    public.is_admin()
    or (public.is_manager_or_admin() and created_by = auth.uid())
  );

-- --------------------------------------------------------------------------
-- tasks
-- --------------------------------------------------------------------------

drop policy if exists "tasks are readable by authenticated users" on public.tasks;
create policy "tasks are readable by authenticated users"
  on public.tasks for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "authenticated users create tasks" on public.tasks;
create policy "authenticated users create tasks"
  on public.tasks for insert
  to authenticated
  with check (created_by = auth.uid());

-- Managers and admins may edit anything; members only their own or assigned
-- tasks. can_edit_task() is SECURITY DEFINER to avoid recursing through the
-- task_assignments policies.
drop policy if exists "task editors update tasks" on public.tasks;
create policy "task editors update tasks"
  on public.tasks for update
  to authenticated
  using (public.is_manager_or_admin() or public.can_edit_task(id))
  with check (public.is_manager_or_admin() or public.can_edit_task(id));

drop policy if exists "managers admins and creators delete tasks" on public.tasks;
create policy "managers admins and creators delete tasks"
  on public.tasks for delete
  to authenticated
  using (public.is_manager_or_admin() or created_by = auth.uid());

-- --------------------------------------------------------------------------
-- task_assignments
-- --------------------------------------------------------------------------

drop policy if exists "assignments are readable by authenticated users" on public.task_assignments;
create policy "assignments are readable by authenticated users"
  on public.task_assignments for select
  to authenticated
  using (auth.uid() is not null);

-- Whoever may edit the task may change who works on it. Members can also pick
-- up unassigned work themselves.
drop policy if exists "task editors add assignees" on public.task_assignments;
create policy "task editors add assignees"
  on public.task_assignments for insert
  to authenticated
  with check (
    public.is_manager_or_admin()
    or public.can_edit_task(task_id)
    or user_id = auth.uid()
  );

drop policy if exists "task editors remove assignees" on public.task_assignments;
create policy "task editors remove assignees"
  on public.task_assignments for delete
  to authenticated
  using (
    public.is_manager_or_admin()
    or public.can_edit_task(task_id)
    or user_id = auth.uid()
  );

-- --------------------------------------------------------------------------
-- comments
-- --------------------------------------------------------------------------

drop policy if exists "comments are readable by authenticated users" on public.comments;
create policy "comments are readable by authenticated users"
  on public.comments for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "users write their own comments" on public.comments;
create policy "users write their own comments"
  on public.comments for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users edit their own comments" on public.comments;
create policy "users edit their own comments"
  on public.comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "authors and admins delete comments" on public.comments;
create policy "authors and admins delete comments"
  on public.comments for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- --------------------------------------------------------------------------
-- task_activity
--
-- Readable by everyone signed in, writable by nobody: rows come only from the
-- SECURITY DEFINER audit triggers, which bypass RLS. Leaving out INSERT,
-- UPDATE and DELETE policies is what makes the log genuinely append-only.
-- --------------------------------------------------------------------------

drop policy if exists "activity is readable by authenticated users" on public.task_activity;
create policy "activity is readable by authenticated users"
  on public.task_activity for select
  to authenticated
  using (auth.uid() is not null);

-- --------------------------------------------------------------------------
-- Table privileges
--
-- RLS narrows access but never grants it. Supabase's default privileges
-- usually cover new public tables already; spelling them out here means the
-- schema also works on a project where those defaults were changed.
--
-- `anon` is deliberately granted nothing — there is no public read surface.
-- --------------------------------------------------------------------------

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, delete on public.task_assignments to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
-- Select only: the audit trail is written exclusively by triggers.
grant select on public.task_activity to authenticated;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_manager_or_admin() to authenticated;
grant execute on function public.can_edit_task(uuid) to authenticated;

-- =========================================================================
-- 20260913000004_realtime.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Publishes the tables the UI subscribes to. Realtime still enforces RLS on
-- every change it forwards, so publishing a table does not widen access.
--
-- Guarded with a lookup on pg_publication so the migration is idempotent and
-- also applies on a plain Postgres instance (CI, local validation) where the
-- Supabase publication does not exist.
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found — skipping';
    return;
  end if;

  foreach target in array array['tasks', 'comments', 'task_assignments', 'task_activity']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

-- Realtime UPDATE payloads only carry the columns needed to identify a row
-- unless the replica identity is full. The board diffs old vs new status, so
-- tasks needs the complete old row.
alter table public.tasks replica identity full;
alter table public.comments replica identity full;

-- =========================================================================
-- 20260913000005_protect_last_admin.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Guard against locking the workspace out of its own admin role.
--
-- An admin may legitimately demote another admin, but if the last one demotes
-- themselves nobody can create projects or manage roles again, and there is no
-- in-app way to recover. This makes that specific transition fail.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_last_admin_demotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  remaining integer;
begin
  if old.role = 'admin' and new.role is distinct from old.role then
    select count(*) into remaining
    from public.profiles
    where role = 'admin' and id <> old.id;

    if remaining = 0 then
      raise exception 'Cannot remove the last admin. Promote another member first.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Runs after guard_profile_role_change (alphabetical order among BEFORE
-- triggers on the same event), so permission is checked before this.
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin
  before update on public.profiles
  for each row execute function public.prevent_last_admin_demotion();
