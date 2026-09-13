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
--   20260913000006_general_tasks_and_review_gate.sql
--   20260913000007_attachments.sql
--   20260913000008_notifications.sql
--   20260913000009_member_view_only_details.sql
--   20260913000010_fix_delete_task_audit.sql
--   20260913000011_due_time_and_positions.sql
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
--
-- Guarded on the column still being called due_date: migration 0011 renames it
-- to due_at, and this file is also shipped inside the re-runnable setup.sql
-- bundle, where it is replayed against an already-migrated database.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'due_date'
  ) then
    execute 'create index if not exists tasks_open_due_date_idx
      on public.tasks (due_date)
      where status <> ''done'' and due_date is not null';
  end if;
end $$;

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

-- =========================================================================
-- 20260913000006_general_tasks_and_review_gate.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- General tasks and the review gate
--
-- 1. Tasks may now exist outside any project ("general tasks"). Creating one
--    is restricted to managers and admins.
-- 2. Only a manager or admin may mark a task done. Everyone else tops out at
--    'in_review', so finished work is reviewed before it is closed.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- General tasks: project_id becomes optional.
-- --------------------------------------------------------------------------

alter table public.tasks alter column project_id drop not null;

comment on column public.tasks.project_id is
  'NULL marks a general task: assigned work that belongs to no project.';

-- Board ordering for the general list, mirroring the per-project index.
create index if not exists tasks_general_status_position_idx
  on public.tasks (status, position)
  where project_id is null;

-- Only managers and admins may open general tasks; anyone may still create a
-- task inside a project.
drop policy if exists "authenticated users create tasks" on public.tasks;
create policy "authenticated users create tasks"
  on public.tasks for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (project_id is not null or public.is_manager_or_admin())
  );

-- --------------------------------------------------------------------------
-- Review gate
--
-- Enforced as a trigger rather than in the RLS policy because the rule is
-- about a transition: a WITH CHECK expression cannot see the previous row, so
-- it could not tell "a member is closing this task" from "a member edited the
-- title of a task that was already closed".
--
-- Moving out of 'done' is restricted to the same roles. Letting an assignee
-- reopen a task would undo the reviewer's decision, which is the very thing
-- the gate exists to protect.
-- --------------------------------------------------------------------------

create or replace function public.enforce_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status
     and 'done' in (new.status::text, old.status::text)
     and not public.is_manager_or_admin()
  then
    if new.status = 'done' then
      raise exception 'Only a manager or admin can mark a task done. Move it to In Review instead.'
        using errcode = 'insufficient_privilege';
    else
      raise exception 'Only a manager or admin can reopen a completed task.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_enforce_review_gate on public.tasks;
create trigger tasks_enforce_review_gate
  before update on public.tasks
  for each row execute function public.enforce_review_gate();

-- Exposed so the UI can disable the Done option up front rather than letting
-- the user discover the rule by hitting an error.
create or replace function public.can_complete_tasks()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_manager_or_admin();
$$;

grant execute on function public.can_complete_tasks() to authenticated;

-- =========================================================================
-- 20260913000007_attachments.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Task attachments — uploaded files and external links.
--
-- Both kinds live in one table so the task detail view renders a single list.
-- A row is either a file (storage_path set) or a link (url set), never both.
-- ---------------------------------------------------------------------------

create table if not exists public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  kind         text not null check (kind in ('file', 'link')),
  name         text not null,
  storage_path text,
  url          text,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now(),

  constraint task_attachments_name_length check (length(btrim(name)) between 1 and 255),

  -- Exactly one of storage_path / url, matching `kind`.
  constraint task_attachments_shape check (
    (kind = 'file' and storage_path is not null and url is null)
    or (kind = 'link' and url is not null and storage_path is null)
  ),

  -- Only http(s) links. Blocks javascript: and data: URLs, which would
  -- otherwise become a stored-XSS vector the moment one is rendered as a link.
  constraint task_attachments_url_scheme check (
    url is null or url ~* '^https?://'
  ),

  constraint task_attachments_size check (
    size_bytes is null or (size_bytes >= 0 and size_bytes <= 26214400)
  )
);

create index if not exists task_attachments_task_idx
  on public.task_attachments (task_id, created_at desc);

create unique index if not exists task_attachments_storage_path_key
  on public.task_attachments (storage_path)
  where storage_path is not null;

comment on table public.task_attachments is
  'Files and links attached to a task. Files live in the task-attachments bucket.';

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

alter table public.task_attachments enable row level security;
alter table public.task_attachments force row level security;

drop policy if exists "attachments are readable by authenticated users" on public.task_attachments;
create policy "attachments are readable by authenticated users"
  on public.task_attachments for select
  to authenticated
  using (auth.uid() is not null);

-- Anyone who may edit the task may attach to it.
drop policy if exists "task editors add attachments" on public.task_attachments;
create policy "task editors add attachments"
  on public.task_attachments for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (public.is_manager_or_admin() or public.can_edit_task(task_id))
  );

drop policy if exists "uploaders and managers remove attachments" on public.task_attachments;
create policy "uploaders and managers remove attachments"
  on public.task_attachments for delete
  to authenticated
  using (uploaded_by = auth.uid() or public.is_manager_or_admin());

grant select, insert, delete on public.task_attachments to authenticated;

-- --------------------------------------------------------------------------
-- Storage bucket
--
-- Private: objects are reached through short-lived signed URLs, so an
-- attachment cannot be read by guessing its path.
--
-- Guarded on the storage schema existing, so this migration also applies to a
-- plain Postgres instance (CI, local validation) that has no Supabase Storage.
-- Object keys are "<task_id>/<uuid>-<filename>", so the first path segment
-- identifies the task an object belongs to.
-- --------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found - skipping bucket and object policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('task-attachments', 'task-attachments', false, 26214400)
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit;

  execute $p$drop policy if exists "attachment objects readable by authenticated" on storage.objects$p$;
  execute $p$create policy "attachment objects readable by authenticated"
    on storage.objects for select
    to authenticated
    using (bucket_id = 'task-attachments' and auth.uid() is not null)$p$;

  execute $p$drop policy if exists "attachment objects writable by task editors" on storage.objects$p$;
  execute $p$create policy "attachment objects writable by task editors"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'task-attachments'
      and owner = auth.uid()
      and (
        public.is_manager_or_admin()
        or public.can_edit_task(nullif(split_part(name, '/', 1), '')::uuid)
      )
    )$p$;

  execute $p$drop policy if exists "attachment objects removable by owner or manager" on storage.objects$p$;
  execute $p$create policy "attachment objects removable by owner or manager"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'task-attachments'
      and (owner = auth.uid() or public.is_manager_or_admin())
    )$p$;
end $$;

-- =========================================================================
-- 20260913000008_notifications.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Notifications
--
-- Written by database triggers rather than application code, so an event
-- cannot be missed because some path forgot to raise it. Each row is private
-- to its recipient.
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  type       text not null,
  title      text not null,
  body       text,
  task_id    uuid references public.tasks (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_type_known check (
    type in (
      'task_assigned',
      'task_unassigned',
      'task_commented',
      'task_mentioned',
      'task_review_requested',
      'task_completed'
    )
  )
);

-- Drives the unread badge and the newest-first list.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- Strictly private: unlike the rest of this schema, a notification is visible
-- only to its recipient.
drop policy if exists "users read their own notifications" on public.notifications;
create policy "users read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Recipients may only mark as read; the content is written by triggers.
drop policy if exists "users update their own notifications" on public.notifications;
create policy "users update their own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users delete their own notifications" on public.notifications;
create policy "users delete their own notifications"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- No INSERT policy or grant: rows come only from the SECURITY DEFINER triggers
-- below, so nobody can forge a notification to another user.
grant select, update, delete on public.notifications to authenticated;

-- --------------------------------------------------------------------------
-- Helper
-- --------------------------------------------------------------------------

create or replace function public.push_notification(
  recipient uuid,
  actor uuid,
  kind text,
  heading text,
  detail text,
  task uuid,
  project uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Never notify someone about their own action, and never about a missing user.
  if recipient is null or recipient = coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid) then
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, title, body, task_id, project_id)
  values (recipient, actor, kind, heading, detail, task, project);
end;
$$;

-- --------------------------------------------------------------------------
-- Assignment
-- --------------------------------------------------------------------------

create or replace function public.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.tasks%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into t from public.tasks where id = new.task_id;
    perform public.push_notification(
      new.user_id, auth.uid(), 'task_assigned',
      'You were assigned a task', t.title, t.id, t.project_id
    );
  else
    select * into t from public.tasks where id = old.task_id;
    -- The task may already be gone when the assignment cascades away.
    if found then
      perform public.push_notification(
        old.user_id, auth.uid(), 'task_unassigned',
        'You were removed from a task', t.title, t.id, t.project_id
      );
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists task_assignments_notify_insert on public.task_assignments;
create trigger task_assignments_notify_insert
  after insert on public.task_assignments
  for each row execute function public.notify_assignment();

drop trigger if exists task_assignments_notify_delete on public.task_assignments;
create trigger task_assignments_notify_delete
  after delete on public.task_assignments
  for each row execute function public.notify_assignment();

-- --------------------------------------------------------------------------
-- Status changes
--
-- Reaching 'in_review' tells whoever has to review it. Reaching 'done' tells
-- the people who worked on it.
-- --------------------------------------------------------------------------

create or replace function public.notify_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  recipient uuid;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'in_review' then
    -- The task's creator reviews it; for general tasks with no creator left,
    -- fall back to every manager and admin.
    if new.created_by is not null then
      perform public.push_notification(
        new.created_by, actor, 'task_review_requested',
        'A task is ready for review', new.title, new.id, new.project_id
      );
    else
      for recipient in
        select id from public.profiles where role in ('admin', 'manager')
      loop
        perform public.push_notification(
          recipient, actor, 'task_review_requested',
          'A task is ready for review', new.title, new.id, new.project_id
        );
      end loop;
    end if;

  elsif new.status = 'done' then
    for recipient in
      select user_id from public.task_assignments where task_id = new.id
      union
      select new.created_by where new.created_by is not null
    loop
      perform public.push_notification(
        recipient, actor, 'task_completed',
        'A task was marked done', new.title, new.id, new.project_id
      );
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists tasks_notify_status_change on public.tasks;
create trigger tasks_notify_status_change
  after update on public.tasks
  for each row execute function public.notify_status_change();

-- --------------------------------------------------------------------------
-- Comments and @mentions
--
-- Mentions are matched against profile names here so that a comment written
-- from anywhere — the app, the SQL editor, a future integration — still
-- notifies the people it names.
-- --------------------------------------------------------------------------

create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.tasks%rowtype;
  recipient uuid;
  mentioned uuid[];
begin
  select * into t from public.tasks where id = new.task_id;
  if not found then
    return null;
  end if;

  -- Anyone named with @Full Name, or @local-part of their email.
  select coalesce(array_agg(p.id), '{}')
    into mentioned
  from public.profiles p
  where p.id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      (p.full_name is not null and new.content ilike '%@' || p.full_name || '%')
      or new.content ilike '%@' || split_part(p.email, '@', 1) || '%'
    );

  foreach recipient in array mentioned loop
    perform public.push_notification(
      recipient, new.user_id, 'task_mentioned',
      'You were mentioned in a comment', left(new.content, 140), t.id, t.project_id
    );
  end loop;

  -- Everyone else with a stake in the task: its assignees and its creator.
  for recipient in
    select a.user_id from public.task_assignments a where a.task_id = t.id
    union
    select t.created_by where t.created_by is not null
  loop
    if not (recipient = any(mentioned)) then
      perform public.push_notification(
        recipient, new.user_id, 'task_commented',
        'New comment on a task', left(new.content, 140), t.id, t.project_id
      );
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

-- --------------------------------------------------------------------------
-- Realtime — the bell updates without a refresh.
-- --------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found - skipping';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- =========================================================================
-- 20260913000009_member_view_only_details.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Team members are view-only on task details.
--
-- Planning is a manager's job. A member receives a task, works on it and
-- reports progress; they do not get to rewrite what they were asked to do.
--
-- Members may still:
--   * move a task's status (up to In Review — see the review gate)
--   * reorder cards on the board
--   * post comments
--   * attach files and links, which is how finished work is handed over
--
-- Members may no longer:
--   * change title, description, priority, due date, or which project a task
--     belongs to
--   * add or remove assignees, including themselves
--   * edit or delete comments, their own included
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Task fields
--
-- A trigger rather than a policy, for the same reason as the review gate: the
-- rule is about which columns changed, and a WITH CHECK expression cannot see
-- the previous row.
-- --------------------------------------------------------------------------

create or replace function public.enforce_task_field_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_manager_or_admin() then
    return new;
  end if;

  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.project_id is distinct from old.project_id
  then
    raise exception 'Only a manager or admin can change task details. You can update the status and add comments or files.'
      using errcode = 'insufficient_privilege';
  end if;

  -- status and position are left alone: progress and board order are exactly
  -- what an assignee is expected to maintain.
  return new;
end;
$$;

drop trigger if exists tasks_enforce_field_permissions on public.tasks;
create trigger tasks_enforce_field_permissions
  before update on public.tasks
  for each row execute function public.enforce_task_field_permissions();

-- --------------------------------------------------------------------------
-- Assignments — managers and admins decide who works on what.
-- --------------------------------------------------------------------------

drop policy if exists "task editors add assignees" on public.task_assignments;
drop policy if exists "managers and admins add assignees" on public.task_assignments;
create policy "managers and admins add assignees"
  on public.task_assignments for insert
  to authenticated
  with check (public.is_manager_or_admin());

drop policy if exists "task editors remove assignees" on public.task_assignments;
drop policy if exists "managers and admins remove assignees" on public.task_assignments;
create policy "managers and admins remove assignees"
  on public.task_assignments for delete
  to authenticated
  using (public.is_manager_or_admin());

-- --------------------------------------------------------------------------
-- Comments — append-only for members.
--
-- The UPDATE policy is tightened alongside DELETE: leaving it open would let a
-- member blank a comment, which is a deletion by another name.
-- --------------------------------------------------------------------------

drop policy if exists "users edit their own comments" on public.comments;
drop policy if exists "managers and admins edit comments" on public.comments;
create policy "managers and admins edit comments"
  on public.comments for update
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

drop policy if exists "authors and admins delete comments" on public.comments;
drop policy if exists "managers and admins delete comments" on public.comments;
create policy "managers and admins delete comments"
  on public.comments for delete
  to authenticated
  using (public.is_manager_or_admin());

-- --------------------------------------------------------------------------
-- Deleting a task is a planning action too.
-- --------------------------------------------------------------------------

drop policy if exists "managers admins and creators delete tasks" on public.tasks;
drop policy if exists "managers and admins delete tasks" on public.tasks;
create policy "managers and admins delete tasks"
  on public.tasks for delete
  to authenticated
  using (public.is_manager_or_admin());

-- --------------------------------------------------------------------------
-- Exposed so the UI can render details read-only rather than letting someone
-- type into a field whose save is going to be refused.
-- --------------------------------------------------------------------------

create or replace function public.can_manage_task_details()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_manager_or_admin();
$$;

grant execute on function public.can_manage_task_details() to authenticated;

-- =========================================================================
-- 20260913000010_fix_delete_task_audit.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Fix: deleting a task failed when it had assignees.
--
-- Deleting a task cascades to task_assignments, which fires the audit trigger,
-- which tried to append an 'assignee_removed' row to task_activity. By then
-- the parent task is already gone, so that insert violated
-- task_activity_task_id_fkey and the whole DELETE was rolled back:
--
--   insert or update on table "task_activity" violates foreign key constraint
--   "task_activity_task_id_fkey"
--
-- The fix is to skip logging when the task no longer exists. Nothing is lost:
-- task_activity rows cascade away with the task, so those entries would have
-- been deleted in the same statement.
--
-- notify_assignment already guarded this case; log_assignment_change did not.
-- ---------------------------------------------------------------------------

create or replace function public.log_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target    uuid;
  label     text;
  parent_id uuid;
begin
  parent_id := case when tg_op = 'INSERT' then new.task_id else old.task_id end;

  -- The assignment is cascading away with its task; there is nothing to log.
  if not exists (select 1 from public.tasks where id = parent_id) then
    return null;
  end if;

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

-- =========================================================================
-- 20260913000011_due_time_and_positions.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Due dates gain a time of day, and profiles gain a job position.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- tasks.due_date (date) -> tasks.due_at (timestamptz)
--
-- Renamed rather than reused: a column called due_date holding a time of day
-- would mislead every future reader. Existing dates are interpreted as the end
-- of that day, so nothing that was not yet overdue silently becomes overdue.
-- --------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'due_date'
  ) then
    alter table public.tasks
      alter column due_date type timestamptz
      using (due_date::timestamp + interval '23 hours 59 minutes');

    alter table public.tasks rename column due_date to due_at;
  end if;
end $$;

comment on column public.tasks.due_at is
  'When the task is due, including time of day. Stored as an absolute instant.';

drop index if exists public.tasks_open_due_date_idx;
create index if not exists tasks_open_due_at_idx
  on public.tasks (due_at)
  where status <> 'done' and due_at is not null;

-- The audit trigger references the old column name.
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

  if new.due_at is distinct from old.due_at then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (new.id, actor, 'due_date_changed', 'due_at', old.due_at::text, new.due_at::text);
  end if;

  if new.title is distinct from old.title then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (new.id, actor, 'updated', 'title', old.title, new.title);
  end if;

  if new.description is distinct from old.description then
    insert into public.task_activity (task_id, actor_id, action, field)
    values (new.id, actor, 'updated', 'description');
  end if;

  return null;
end;
$$;

-- The member field guard references it too.
create or replace function public.enforce_task_field_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_manager_or_admin() then
    return new;
  end if;

  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.priority is distinct from old.priority
     or new.due_at is distinct from old.due_at
     or new.project_id is distinct from old.project_id
  then
    raise exception 'Only a manager or admin can change task details. You can update the status and add comments or files.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- profiles.job_title
--
-- Named job_title, not "position": tasks.position already means sort order in
-- this schema, and reusing the word for something unrelated invites mistakes.
-- The UI labels it "Position".
-- --------------------------------------------------------------------------

alter table public.profiles
  add column if not exists job_title text;

alter table public.profiles
  drop constraint if exists profiles_job_title_length;
alter table public.profiles
  add constraint profiles_job_title_length
  check (job_title is null or length(btrim(job_title)) between 1 and 60);

-- Positions are assigned, not self-declared: the same guard that blocks
-- self-promotion now also pins job_title for anyone who is not an admin.
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

  if new.job_title is distinct from old.job_title and not public.is_admin() then
    raise exception 'Only an admin can change a job position'
      using errcode = 'insufficient_privilege';
  end if;

  -- id and email track auth.users and are not user-editable.
  new.id := old.id;
  new.email := old.email;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Avatars bucket
--
-- Public, unlike task attachments: avatars are rendered in lists all over the
-- app, and signing every one of them per request would be pure overhead for
-- images that carry nothing sensitive. Writes stay locked to the owner.
--
-- Object keys are "<user_id>/<file>", so the first path segment is the owner.
-- --------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found - skipping avatar bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('avatars', 'avatars', true, 2097152)
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit;

  execute $p$drop policy if exists "avatars are publicly readable" on storage.objects$p$;
  execute $p$create policy "avatars are publicly readable"
    on storage.objects for select
    using (bucket_id = 'avatars')$p$;

  execute $p$drop policy if exists "users upload their own avatar" on storage.objects$p$;
  execute $p$create policy "users upload their own avatar"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'avatars'
      and nullif(split_part(name, '/', 1), '') = auth.uid()::text
    )$p$;

  execute $p$drop policy if exists "users replace their own avatar" on storage.objects$p$;
  execute $p$create policy "users replace their own avatar"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'avatars'
      and nullif(split_part(name, '/', 1), '') = auth.uid()::text
    )$p$;

  execute $p$drop policy if exists "users remove their own avatar" on storage.objects$p$;
  execute $p$create policy "users remove their own avatar"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'avatars'
      and (
        nullif(split_part(name, '/', 1), '') = auth.uid()::text
        or public.is_admin()
      )
    )$p$;
end $$;
