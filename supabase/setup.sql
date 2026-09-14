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
--   20260913000012_project_membership.sql
--   20260913000013_follow_ups.sql
--   20260913000014_reminders.sql
--   20260913000015_members_see_only_assigned.sql
--   20260914000016_personal_notes.sql
--   20260914000017_claim_reminders_and_counts.sql
--   20260914000018_task_counts_timezone.sql
--   20260914000019_shared_notes.sql
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

-- Created only if absent, so the script stays re-runnable. If a type of the
-- same name already exists with different values, this database belongs to a
-- different application — stop with an explanation rather than failing later
-- with a confusing "invalid input value for enum" on the first table.
create or replace function public.assert_enum(
  type_name text,
  required text[]
)
returns void
language plpgsql
as $fn$
declare
  existing text[];
begin
  if not exists (
    select 1 from pg_type
    where typname = type_name and typnamespace = 'public'::regnamespace
  ) then
    execute format(
      'create type public.%I as enum (%s)',
      type_name,
      (select string_agg(quote_literal(v), ', ') from unnest(required) v)
    );
    return;
  end if;

  select array_agg(e.enumlabel::text order by e.enumsortorder)
    into existing
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = type_name and t.typnamespace = 'public'::regnamespace;

  if not (required <@ existing) then
    raise exception
      'public.% already exists here with different values (%), so this database belongs to another application.',
      type_name, array_to_string(existing, ', ')
      using hint =
        'Run this script against a Supabase project created for the task portal, not one already in use. Check the project selector at the top of the SQL editor.';
  end if;
end;
$fn$;

select public.assert_enum('user_role', array['admin', 'manager', 'member']);
select public.assert_enum('task_status', array['todo', 'in_progress', 'in_review', 'done']);
select public.assert_enum('task_priority', array['low', 'medium', 'high', 'urgent']);

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

-- =========================================================================
-- 20260913000012_project_membership.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Project membership
--
-- Until now every signed-in employee could read the whole workspace. Projects
-- are now private to the people on them: if you are not a member you do not
-- see the project, its tasks, its comments, its files or its history.
--
-- Who sees a project
--   * admins           — everything, so the workspace stays administrable
--   * project members   — the people explicitly added to it
--   * the creator       — added as a member automatically
--
-- Membership is granted two ways, so assigning work can never produce a task
-- its assignee cannot open:
--   1. explicitly, by an admin or manager
--   2. automatically, when someone is assigned a task in that project
--
-- General tasks (no project) follow the same principle: assignees and the
-- creator see them, and so do managers and admins.
-- ---------------------------------------------------------------------------

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  added_at   timestamptz not null default now(),

  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx
  on public.project_members (user_id);

comment on table public.project_members is
  'Who can see a project. Membership is the unit of project visibility.';

-- --------------------------------------------------------------------------
-- Visibility helpers
--
-- SECURITY DEFINER so they can read project_members without going through the
-- policies that are themselves defined in terms of these functions.
-- --------------------------------------------------------------------------

create or replace function public.can_view_project(project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    project is not null
    and (
      public.is_admin()
      or exists (
        select 1 from public.project_members m
        where m.project_id = project and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.projects p
        where p.id = project and p.created_by = auth.uid()
      )
    );
$$;

-- A task is visible when its project is, or — for a general task — when the
-- caller is its creator, an assignee, or a manager or admin.
create or replace function public.can_view_task(task uuid)
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
        case
          when t.project_id is not null then public.can_view_project(t.project_id)
          else
            public.is_manager_or_admin()
            or t.created_by = auth.uid()
            or exists (
              select 1 from public.task_assignments a
              where a.task_id = t.id and a.user_id = auth.uid()
            )
        end
      )
  );
$$;

grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Keeping membership in step
-- --------------------------------------------------------------------------

-- Whoever creates a project is on it.
create or replace function public.add_project_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, added_by)
    values (new.id, new.created_by, new.created_by)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists projects_add_creator on public.projects;
create trigger projects_add_creator
  after insert on public.projects
  for each row execute function public.add_project_creator_as_member();

-- Being given a task in a project puts you on that project. Without this, a
-- manager could assign work that its assignee is not allowed to open.
create or replace function public.add_assignee_as_project_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project uuid;
begin
  select project_id into target_project from public.tasks where id = new.task_id;

  if target_project is not null then
    insert into public.project_members (project_id, user_id, added_by)
    values (target_project, new.user_id, auth.uid())
    on conflict do nothing;
  end if;

  return null;
end;
$$;

drop trigger if exists task_assignments_add_project_member on public.task_assignments;
create trigger task_assignments_add_project_member
  after insert on public.task_assignments
  for each row execute function public.add_assignee_as_project_member();

-- --------------------------------------------------------------------------
-- Backfill
--
-- Existing projects have no members yet. Without this every project would
-- vanish for everyone but admins the moment this migration lands.
-- --------------------------------------------------------------------------

insert into public.project_members (project_id, user_id, added_by)
select p.id, p.created_by, p.created_by
from public.projects p
where p.created_by is not null
on conflict do nothing;

insert into public.project_members (project_id, user_id)
select distinct t.project_id, a.user_id
from public.task_assignments a
join public.tasks t on t.id = a.task_id
where t.project_id is not null
on conflict do nothing;

-- --------------------------------------------------------------------------
-- RLS on project_members itself
-- --------------------------------------------------------------------------

alter table public.project_members enable row level security;
alter table public.project_members force row level security;

drop policy if exists "members readable within visible projects" on public.project_members;
create policy "members readable within visible projects"
  on public.project_members for select
  to authenticated
  using (public.can_view_project(project_id));

drop policy if exists "managers and admins add project members" on public.project_members;
create policy "managers and admins add project members"
  on public.project_members for insert
  to authenticated
  with check (public.is_manager_or_admin() and public.can_view_project(project_id));

drop policy if exists "managers and admins remove project members" on public.project_members;
create policy "managers and admins remove project members"
  on public.project_members for delete
  to authenticated
  using (public.is_manager_or_admin() and public.can_view_project(project_id));

grant select, insert, delete on public.project_members to authenticated;

-- --------------------------------------------------------------------------
-- Narrow every read policy to what the caller can actually see
-- --------------------------------------------------------------------------

drop policy if exists "projects are readable by authenticated users" on public.projects;
drop policy if exists "projects are readable by members" on public.projects;
create policy "projects are readable by members"
  on public.projects for select
  to authenticated
  using (public.can_view_project(id));

drop policy if exists "tasks are readable by authenticated users" on public.tasks;
drop policy if exists "tasks are readable within visible projects" on public.tasks;
create policy "tasks are readable within visible projects"
  on public.tasks for select
  to authenticated
  using (
    case
      when project_id is not null then public.can_view_project(project_id)
      else
        public.is_manager_or_admin()
        or created_by = auth.uid()
        or exists (
          select 1 from public.task_assignments a
          where a.task_id = tasks.id and a.user_id = auth.uid()
        )
    end
  );

drop policy if exists "assignments are readable by authenticated users" on public.task_assignments;
drop policy if exists "assignments readable within visible tasks" on public.task_assignments;
create policy "assignments readable within visible tasks"
  on public.task_assignments for select
  to authenticated
  using (public.can_view_task(task_id));

drop policy if exists "comments are readable by authenticated users" on public.comments;
drop policy if exists "comments readable within visible tasks" on public.comments;
create policy "comments readable within visible tasks"
  on public.comments for select
  to authenticated
  using (public.can_view_task(task_id));

drop policy if exists "activity is readable by authenticated users" on public.task_activity;
drop policy if exists "activity readable within visible tasks" on public.task_activity;
create policy "activity readable within visible tasks"
  on public.task_activity for select
  to authenticated
  using (public.can_view_task(task_id));

drop policy if exists "attachments are readable by authenticated users" on public.task_attachments;
drop policy if exists "attachments readable within visible tasks" on public.task_attachments;
create policy "attachments readable within visible tasks"
  on public.task_attachments for select
  to authenticated
  using (public.can_view_task(task_id));

-- Writing follows seeing: you cannot add a task, comment or file to something
-- you are not allowed to look at.
drop policy if exists "authenticated users create tasks" on public.tasks;
create policy "authenticated users create tasks"
  on public.tasks for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      case
        when project_id is not null then public.can_view_project(project_id)
        else public.is_manager_or_admin()
      end
    )
  );

drop policy if exists "users write their own comments" on public.comments;
create policy "users write their own comments"
  on public.comments for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_task(task_id));

-- profiles stay readable workspace-wide: the assignee picker, @mentions and
-- the team page all need the directory, and a name and role are not the
-- sensitive part of a project.

-- =========================================================================
-- 20260913000013_follow_ups.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Follow-ups
--
-- A task can carry a date to chase it on, plus a note saying what to chase
-- ("call the supplier Tuesday"). The follow-up list reads from these.
--
-- Stored as columns rather than a separate table: a task has one *next*
-- follow-up at a time, and the history of previous ones is already captured by
-- the audit trail below.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists follow_up_at timestamptz;

alter table public.tasks
  add column if not exists follow_up_note text;

alter table public.tasks
  drop constraint if exists tasks_follow_up_note_length;
alter table public.tasks
  add constraint tasks_follow_up_note_length
  check (follow_up_note is null or length(btrim(follow_up_note)) between 1 and 500);

-- A note without a date would never surface in the list.
alter table public.tasks
  drop constraint if exists tasks_follow_up_note_needs_date;
alter table public.tasks
  add constraint tasks_follow_up_note_needs_date
  check (follow_up_note is null or follow_up_at is not null);

comment on column public.tasks.follow_up_at is
  'When this task should next be chased. Drives the follow-up list.';

create index if not exists tasks_follow_up_idx
  on public.tasks (follow_up_at)
  where follow_up_at is not null and status <> 'done';

-- --------------------------------------------------------------------------
-- Follow-ups are planning, like the due date, so they follow the same rule:
-- managers and admins set them, members see them.
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
     or new.due_at is distinct from old.due_at
     or new.project_id is distinct from old.project_id
     or new.follow_up_at is distinct from old.follow_up_at
     or new.follow_up_note is distinct from old.follow_up_note
  then
    raise exception 'Only a manager or admin can change task details. You can update the status and add comments or files.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Audit follow-up changes, so the history of what was chased and when survives
-- even though only the next one is stored.
-- --------------------------------------------------------------------------

alter table public.task_activity
  drop constraint if exists task_activity_action_known;
alter table public.task_activity
  add constraint task_activity_action_known check (
    action in (
      'created',
      'updated',
      'status_changed',
      'priority_changed',
      'due_date_changed',
      'follow_up_set',
      'follow_up_cleared',
      'assignee_added',
      'assignee_removed',
      'commented'
    )
  );

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

  if new.follow_up_at is distinct from old.follow_up_at
     or new.follow_up_note is distinct from old.follow_up_note then
    if new.follow_up_at is null then
      insert into public.task_activity (task_id, actor_id, action, field, old_value)
      values (new.id, actor, 'follow_up_cleared', 'follow_up_at', old.follow_up_at::text);
    else
      insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
      values (
        new.id, actor, 'follow_up_set', 'follow_up_at',
        old.follow_up_at::text,
        new.follow_up_at::text ||
          coalesce(' - ' || nullif(btrim(new.follow_up_note), ''), '')
      );
    end if;
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

-- =========================================================================
-- 20260913000014_reminders.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Task reminders over email, Telegram and WhatsApp
--
-- Two tables:
--   notification_preferences — which channels a person wants, where to reach
--                              them, and which events are worth interrupting
--                              them for
--   reminder_queue           — one row per message to send, drained by a
--                              scheduled dispatcher in the app
--
-- Queuing rather than sending inline means a provider outage cannot lose a
-- reminder, retries are bounded and visible, and the same reminder can never
-- go out twice — see dedupe_key.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Preferences
-- --------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  -- Channels. Email is on by default because the address is already known and
  -- verified by sign-up; the other two need details the user has to supply.
  email_enabled    boolean not null default true,
  telegram_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,

  -- Where to reach them.
  telegram_chat_id  text,
  whatsapp_number   text,

  -- A short-lived code the user sends to the bot to prove the chat is theirs.
  telegram_link_code text,

  -- Which events are worth a message.
  remind_assigned   boolean not null default true,
  remind_due_soon   boolean not null default true,
  remind_overdue    boolean not null default true,
  remind_follow_up  boolean not null default true,

  -- How far ahead of the due time to warn.
  due_soon_lead_hours integer not null default 24,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_preferences_lead_range
    check (due_soon_lead_hours between 1 and 168),

  -- E.164, the format every WhatsApp provider expects.
  constraint notification_preferences_whatsapp_format
    check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9]\d{6,14}$'),

  -- A channel cannot be switched on without somewhere to send to.
  constraint notification_preferences_telegram_needs_chat
    check (not telegram_enabled or telegram_chat_id is not null),
  constraint notification_preferences_whatsapp_needs_number
    check (not whatsapp_enabled or whatsapp_number is not null)
);

create unique index if not exists notification_preferences_link_code_key
  on public.notification_preferences (telegram_link_code)
  where telegram_link_code is not null;

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Everyone gets a row, so the dispatcher never has to reason about its absence.
create or replace function public.ensure_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return null;
end;
$$;

drop trigger if exists profiles_ensure_notification_preferences on public.profiles;
create trigger profiles_ensure_notification_preferences
  after insert on public.profiles
  for each row execute function public.ensure_notification_preferences();

insert into public.notification_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- --------------------------------------------------------------------------
-- Outbound queue
-- --------------------------------------------------------------------------

create table if not exists public.reminder_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete cascade,

  channel    text not null check (channel in ('email', 'telegram', 'whatsapp')),
  kind       text not null check (kind in ('assigned', 'due_soon', 'overdue', 'follow_up')),

  recipient  text not null,
  subject    text,
  body       text not null,

  status     text not null default 'pending'
             check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts   integer not null default 0,
  last_error text,

  -- Identifies the exact reminder, so re-running the scheduler cannot send the
  -- same thing twice. Changing a due date changes the key, which is what makes
  -- a rescheduled task legitimately remind again.
  dedupe_key text not null unique,

  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- The dispatcher's query: what is pending and due, oldest first.
create index if not exists reminder_queue_pending_idx
  on public.reminder_queue (scheduled_for)
  where status = 'pending';

create index if not exists reminder_queue_user_idx
  on public.reminder_queue (user_id, created_at desc);

-- --------------------------------------------------------------------------
-- Row Level Security
--
-- Reminders are personal. A user may read their own to see what was sent, and
-- nothing else: the queue is written by the scheduler below and drained by the
-- dispatcher, both of which run outside RLS.
-- --------------------------------------------------------------------------

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;
alter table public.reminder_queue enable row level security;
alter table public.reminder_queue force row level security;

drop policy if exists "users read their own preferences" on public.notification_preferences;
create policy "users read their own preferences"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users update their own preferences" on public.notification_preferences;
create policy "users update their own preferences"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users read their own reminders" on public.reminder_queue;
create policy "users read their own reminders"
  on public.reminder_queue for select
  to authenticated
  using (user_id = auth.uid());

grant select, update on public.notification_preferences to authenticated;
grant select on public.reminder_queue to authenticated;

-- --------------------------------------------------------------------------
-- Scheduling
--
-- Builds the queue from the current state of the tasks table. Safe to call as
-- often as you like: every insert is keyed, so repeat runs are no-ops until
-- something actually changes.
-- --------------------------------------------------------------------------

create or replace function public.enqueue_task_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted integer := 0;
begin
  -- Work that is due within the recipient's chosen lead time.
  with candidates as (
    select
      t.id as task_id, t.title, t.due_at,
      a.user_id,
      p.email,
      np.email_enabled, np.telegram_enabled, np.whatsapp_enabled,
      np.telegram_chat_id, np.whatsapp_number, np.due_soon_lead_hours
    from public.tasks t
    join public.task_assignments a on a.task_id = t.id
    join public.profiles p on p.id = a.user_id
    join public.notification_preferences np on np.user_id = a.user_id
    where t.status <> 'done'
      and t.due_at is not null
      and np.remind_due_soon
      and t.due_at > now()
      and t.due_at <= now() + make_interval(hours => np.due_soon_lead_hours)
  )
  insert into public.reminder_queue
    (user_id, task_id, channel, kind, recipient, subject, body, dedupe_key)
  select
    c.user_id, c.task_id, ch.channel, 'due_soon',
    case ch.channel
      when 'email' then c.email
      when 'telegram' then c.telegram_chat_id
      else c.whatsapp_number
    end,
    'Due soon: ' || c.title,
    c.title || ' is due ' || to_char(c.due_at at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC.',
    'due_soon:' || c.task_id || ':' || c.user_id || ':' || ch.channel || ':' || extract(epoch from c.due_at)::bigint
  from candidates c
  cross join lateral (
    select 'email'::text as channel where c.email_enabled
    union all select 'telegram' where c.telegram_enabled and c.telegram_chat_id is not null
    union all select 'whatsapp' where c.whatsapp_enabled and c.whatsapp_number is not null
  ) ch
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted = row_count;

  -- Work that is already late. Keyed by the day so a task that stays overdue
  -- nags once a day rather than on every scheduler run.
  with candidates as (
    select
      t.id as task_id, t.title, t.due_at,
      a.user_id, p.email,
      np.email_enabled, np.telegram_enabled, np.whatsapp_enabled,
      np.telegram_chat_id, np.whatsapp_number, np.due_soon_lead_hours
    from public.tasks t
    join public.task_assignments a on a.task_id = t.id
    join public.profiles p on p.id = a.user_id
    join public.notification_preferences np on np.user_id = a.user_id
    where t.status <> 'done'
      and t.due_at is not null
      and t.due_at < now()
      and np.remind_overdue
  )
  insert into public.reminder_queue
    (user_id, task_id, channel, kind, recipient, subject, body, dedupe_key)
  select
    c.user_id, c.task_id, ch.channel, 'overdue',
    case ch.channel
      when 'email' then c.email
      when 'telegram' then c.telegram_chat_id
      else c.whatsapp_number
    end,
    'Overdue: ' || c.title,
    c.title || ' was due ' || to_char(c.due_at at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC and is still open.',
    'overdue:' || c.task_id || ':' || c.user_id || ':' || ch.channel || ':' || to_char(now(), 'YYYY-MM-DD')
  from candidates c
  cross join lateral (
    select 'email'::text as channel where c.email_enabled
    union all select 'telegram' where c.telegram_enabled and c.telegram_chat_id is not null
    union all select 'whatsapp' where c.whatsapp_enabled and c.whatsapp_number is not null
  ) ch
  on conflict (dedupe_key) do nothing;

  -- Follow-ups that have come due, to whoever has to chase them.
  with candidates as (
    select
      t.id as task_id, t.title, t.follow_up_at, t.follow_up_note,
      a.user_id, p.email,
      np.email_enabled, np.telegram_enabled, np.whatsapp_enabled,
      np.telegram_chat_id, np.whatsapp_number, np.due_soon_lead_hours
    from public.tasks t
    join public.task_assignments a on a.task_id = t.id
    join public.profiles p on p.id = a.user_id
    join public.notification_preferences np on np.user_id = a.user_id
    where t.status <> 'done'
      and t.follow_up_at is not null
      and t.follow_up_at <= now()
      and np.remind_follow_up
  )
  insert into public.reminder_queue
    (user_id, task_id, channel, kind, recipient, subject, body, dedupe_key)
  select
    c.user_id, c.task_id, ch.channel, 'follow_up',
    case ch.channel
      when 'email' then c.email
      when 'telegram' then c.telegram_chat_id
      else c.whatsapp_number
    end,
    'Follow up: ' || c.title,
    coalesce(c.follow_up_note, 'Time to follow up on ' || c.title) || ' (' || c.title || ')',
    'follow_up:' || c.task_id || ':' || c.user_id || ':' || ch.channel || ':' || extract(epoch from c.follow_up_at)::bigint
  from candidates c
  cross join lateral (
    select 'email'::text as channel where c.email_enabled
    union all select 'telegram' where c.telegram_enabled and c.telegram_chat_id is not null
    union all select 'whatsapp' where c.whatsapp_enabled and c.whatsapp_number is not null
  ) ch
  on conflict (dedupe_key) do nothing;

  return inserted;
end;
$$;

-- Being handed work is worth telling someone about immediately rather than
-- waiting for the next scheduler run.
create or replace function public.enqueue_assignment_reminder()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.tasks%rowtype;
  prefs public.notification_preferences%rowtype;
begin
  select * into t from public.tasks where id = new.task_id;
  if not found then return null; end if;

  select * into prefs from public.notification_preferences where user_id = new.user_id;
  if not found or not prefs.remind_assigned then return null; end if;

  insert into public.reminder_queue
    (user_id, task_id, channel, kind, recipient, subject, body, dedupe_key)
  select
    new.user_id, t.id, ch.channel, 'assigned',
    ch.recipient,
    'Assigned to you: ' || t.title,
    'You were assigned "' || t.title || '"'
      || coalesce(' - due ' || to_char(t.due_at at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC', '') || '.',
    'assigned:' || t.id || ':' || new.user_id || ':' || ch.channel
  from (
    select 'email'::text as channel, (select email from public.profiles where id = new.user_id) as recipient
      where prefs.email_enabled
    union all
    select 'telegram', prefs.telegram_chat_id
      where prefs.telegram_enabled and prefs.telegram_chat_id is not null
    union all
    select 'whatsapp', prefs.whatsapp_number
      where prefs.whatsapp_enabled and prefs.whatsapp_number is not null
  ) ch
  where ch.recipient is not null
  on conflict (dedupe_key) do nothing;

  return null;
end;
$$;

drop trigger if exists task_assignments_enqueue_reminder on public.task_assignments;
create trigger task_assignments_enqueue_reminder
  after insert on public.task_assignments
  for each row execute function public.enqueue_assignment_reminder();

-- =========================================================================
-- 20260913000015_members_see_only_assigned.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Team members see only the work given to them.
--
-- Tightens two things at once:
--
--   1. Creating a task becomes a manager/admin action. Members never create,
--      and (since migration 0009) never delete.
--   2. A member sees only tasks assigned to them — including inside a project
--      they belong to. Their board is their own work, not the team's.
--
-- What a member can still do on a task they are assigned:
--   * read it
--   * move its status, up to In Review
--   * comment on it
--   * attach files and links
--
-- Managers and admins are unchanged: they see the projects they are on, and
-- admins see everything.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Creating a task
-- --------------------------------------------------------------------------

drop policy if exists "authenticated users create tasks" on public.tasks;
drop policy if exists "managers and admins create tasks" on public.tasks;
create policy "managers and admins create tasks"
  on public.tasks for insert
  to authenticated
  with check (
    public.is_manager_or_admin()
    and created_by = auth.uid()
    -- A project task still has to go in a project the creator can see.
    and (project_id is null or public.can_view_project(project_id))
  );

-- --------------------------------------------------------------------------
-- Seeing a task
--
-- can_view_task is the single definition the comment, activity, attachment and
-- assignment policies all resolve through, so changing it here narrows every
-- one of them in step.
-- --------------------------------------------------------------------------

create or replace function public.can_view_task(task uuid)
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
        -- Assigned to me: the only route a member has.
        exists (
          select 1 from public.task_assignments a
          where a.task_id = t.id and a.user_id = auth.uid()
        )
        -- Managers and admins see whole projects; admins see every project.
        or (
          public.is_manager_or_admin()
          and (t.project_id is null or public.can_view_project(t.project_id))
        )
      )
  );
$$;

drop policy if exists "tasks are readable within visible projects" on public.tasks;
drop policy if exists "tasks are readable when assigned or managed" on public.tasks;
create policy "tasks are readable when assigned or managed"
  on public.tasks for select
  to authenticated
  using (
    exists (
      select 1 from public.task_assignments a
      where a.task_id = tasks.id and a.user_id = auth.uid()
    )
    or (
      public.is_manager_or_admin()
      and (project_id is null or public.can_view_project(project_id))
    )
  );

-- --------------------------------------------------------------------------
-- Assignments
--
-- A member may only see who else is on a task they can see. Without narrowing
-- this, the assignee list would leak the existence of tasks they cannot open.
-- --------------------------------------------------------------------------

drop policy if exists "assignments readable within visible tasks" on public.task_assignments;
drop policy if exists "assignments readable for visible tasks" on public.task_assignments;
create policy "assignments readable for visible tasks"
  on public.task_assignments for select
  to authenticated
  using (public.can_view_task(task_id));

-- --------------------------------------------------------------------------
-- Projects
--
-- Membership still decides whether a project is visible at all — a member needs
-- the project to exist in order to reach the task inside it. They simply see
-- none of its other tasks.
-- --------------------------------------------------------------------------

comment on function public.can_view_task(uuid) is
  'A task is visible when it is assigned to the caller, or when the caller is a manager or admin who can see its project.';

-- =========================================================================
-- 20260914000016_personal_notes.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- My List — personal notes
--
-- A private scratchpad for what someone has to get through today, separate
-- from the assigned-task system. Unlike everything else in this schema these
-- rows are visible to exactly one person: there is no manager override and no
-- admin override, because a personal list nobody else can read is the whole
-- point of it.
--
-- A note owns its checklist items. They are separate rows rather than a JSON
-- blob so that ticking one box is a single narrow UPDATE — the interaction
-- that has to feel instant on a phone — instead of rewriting the note.
-- ---------------------------------------------------------------------------

create table if not exists public.personal_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint personal_notes_title_length check (char_length(title) <= 200),
  constraint personal_notes_body_length check (char_length(body) <= 20000)
);

-- The list is ordered pinned-first then most recently touched, which is also
-- the only way it is ever read.
create index if not exists personal_notes_user_idx
  on public.personal_notes (user_id, pinned desc, updated_at desc);

create table if not exists public.personal_note_items (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.personal_notes (id) on delete cascade,
  -- Denormalised from the note so the RLS policy is a plain column check and
  -- never has to look at another table.
  user_id    uuid not null references public.profiles (id) on delete cascade,
  content    text not null default '',
  done       boolean not null default false,
  position   double precision not null default 1024,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint personal_note_items_content_length check (char_length(content) <= 1000)
);

create index if not exists personal_note_items_note_idx
  on public.personal_note_items (note_id, position);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest, and bubble item edits up to the note so the list
-- re-sorts when you tick something off.
-- ---------------------------------------------------------------------------

drop trigger if exists personal_notes_set_updated_at on public.personal_notes;
create trigger personal_notes_set_updated_at
  before update on public.personal_notes
  for each row execute function public.set_updated_at();

drop trigger if exists personal_note_items_set_updated_at on public.personal_note_items;
create trigger personal_note_items_set_updated_at
  before update on public.personal_note_items
  for each row execute function public.set_updated_at();

create or replace function public.touch_personal_note()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.personal_notes
     set updated_at = now()
   where id = coalesce(new.note_id, old.note_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists personal_note_items_touch_note on public.personal_note_items;
create trigger personal_note_items_touch_note
  after insert or update or delete on public.personal_note_items
  for each row execute function public.touch_personal_note();

-- ---------------------------------------------------------------------------
-- Row Level Security: your own rows, and nothing else.
-- ---------------------------------------------------------------------------

alter table public.personal_notes enable row level security;
alter table public.personal_notes force row level security;
alter table public.personal_note_items enable row level security;
alter table public.personal_note_items force row level security;

drop policy if exists "own notes are readable" on public.personal_notes;
create policy "own notes are readable"
  on public.personal_notes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "own notes are writable" on public.personal_notes;
create policy "own notes are writable"
  on public.personal_notes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own notes are updatable" on public.personal_notes;
create policy "own notes are updatable"
  on public.personal_notes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own notes are deletable" on public.personal_notes;
create policy "own notes are deletable"
  on public.personal_notes for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "own note items are readable" on public.personal_note_items;
create policy "own note items are readable"
  on public.personal_note_items for select
  to authenticated
  using (user_id = auth.uid());

-- The note must also be yours, so an item cannot be parked on someone else's
-- note by forging note_id.
drop policy if exists "own note items are writable" on public.personal_note_items;
create policy "own note items are writable"
  on public.personal_note_items for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.personal_notes n
       where n.id = note_id and n.user_id = auth.uid()
    )
  );

drop policy if exists "own note items are updatable" on public.personal_note_items;
create policy "own note items are updatable"
  on public.personal_note_items for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own note items are deletable" on public.personal_note_items;
create policy "own note items are deletable"
  on public.personal_note_items for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.personal_notes to authenticated;
grant select, insert, update, delete on public.personal_note_items to authenticated;

-- =========================================================================
-- 20260914000017_claim_reminders_and_counts.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Stop the reminder dispatcher sending the same message twice
--
-- The dispatcher read pending rows, delivered them, then marked them sent. If
-- the serverless function hit its timeout between the delivery and the update
-- — which a batch of forty slow provider calls can do — the row stayed pending
-- and the next run sent it again. A second WhatsApp at 7am is not a harmless
-- bug.
--
-- Rows are now claimed before any provider is called. `claim_reminders` moves
-- a batch to 'sending' and returns it, in one statement, with SKIP LOCKED so
-- two overlapping runs cannot claim the same row. A row that ends up stranded
-- in 'sending' (the function died mid-flight) is released by the next run
-- after a grace period, which is the one case where a duplicate is still
-- possible and is far better than the alternative of never retrying at all.
-- ---------------------------------------------------------------------------

alter table public.reminder_queue
  drop constraint if exists reminder_queue_status_check;

alter table public.reminder_queue
  add constraint reminder_queue_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled'));

-- When the row was picked up, so a stranded claim can be spotted and released.
alter table public.reminder_queue
  add column if not exists claimed_at timestamptz;

create index if not exists reminder_queue_claimed_idx
  on public.reminder_queue (claimed_at)
  where status = 'sending';

/**
 * Claim a batch of due reminders.
 *
 * SECURITY DEFINER because only the service-role dispatcher calls it, and it
 * must see every user's queue. search_path is pinned so a caller cannot
 * shadow the tables it touches.
 */
create or replace function public.claim_reminders(batch_size integer default 40)
returns setof public.reminder_queue
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Release anything left 'sending' by a run that died. Ten minutes is far
  -- longer than any provider call and any function timeout.
  update public.reminder_queue
     set status = 'pending', claimed_at = null
   where status = 'sending'
     and claimed_at < now() - interval '10 minutes';

  return query
  with due as (
    select id
      from public.reminder_queue
     where status = 'pending'
       and scheduled_for <= now()
     order by scheduled_for
     limit greatest(1, least(batch_size, 200))
     -- Two dispatchers running at once take different rows instead of
     -- blocking on each other and then both sending.
     for update skip locked
  )
  update public.reminder_queue q
     set status = 'sending', claimed_at = now()
    from due
   where q.id = due.id
  returning q.*;
end;
$$;

revoke all on function public.claim_reminders(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Count tasks in the database instead of in the browser
--
-- The dashboard read every task the viewer could see and counted them in
-- JavaScript. That is fine at fifty tasks and wasteful at five thousand: the
-- rows were fetched, serialised and shipped only to be reduced to six numbers.
--
-- SECURITY INVOKER (the default) on purpose — the counts must be filtered by
-- the caller's own RLS, exactly as the old query was.
-- ---------------------------------------------------------------------------

create or replace function public.task_counts()
returns table (
  total       bigint,
  done        bigint,
  todo        bigint,
  in_progress bigint,
  in_review   bigint,
  overdue     bigint,
  due_today   bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    count(*)                                                        as total,
    count(*) filter (where status = 'done')                         as done,
    count(*) filter (where status = 'todo')                         as todo,
    count(*) filter (where status = 'in_progress')                  as in_progress,
    count(*) filter (where status = 'in_review')                    as in_review,
    count(*) filter (where status <> 'done' and due_at < now())     as overdue,
    count(*) filter (
      where status <> 'done'
        and due_at >= date_trunc('day', now())
        and due_at <  date_trunc('day', now()) + interval '1 day'
    )                                                               as due_today
  from public.tasks;
$$;

grant execute on function public.task_counts() to authenticated;

/**
 * Per-assignee workload, for the dashboard's "who is busy" panel.
 *
 * The other half of the same problem: this was computed by walking every task
 * and every assignment in JavaScript. SECURITY INVOKER again, so a member
 * sees only their own row and a manager sees their team.
 */
create or replace function public.workload_counts()
returns table (
  user_id uuid,
  open    bigint,
  done    bigint,
  overdue bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    a.user_id,
    count(*) filter (where t.status <> 'done')                     as open,
    count(*) filter (where t.status = 'done')                      as done,
    count(*) filter (where t.status <> 'done' and t.due_at < now()) as overdue
  from public.task_assignments a
  join public.tasks t on t.id = a.task_id
  group by a.user_id;
$$;

grant execute on function public.workload_counts() to authenticated;

-- =========================================================================
-- 20260914000018_task_counts_timezone.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- "Due Today" means today where the viewer is
--
-- task_counts() decided what was due today with date_trunc('day', now()),
-- which is midnight in the *database's* timezone — UTC on Supabase. Every
-- other place in the app asks the browser, so it uses the viewer's calendar
-- day. Four hours east of UTC the two disagree for a quarter of every day: a
-- task due at 02:00 on Tuesday local time is 22:00 Monday in UTC, so the
-- dashboard tile counted it as due today while the list it opens showed
-- nothing. Overdue was never affected — an instant is an instant.
--
-- The caller now passes its IANA timezone, and the count is taken on that
-- calendar. An unknown or missing name falls back to UTC rather than raising,
-- so a stale or hand-edited cookie cannot break the dashboard.
-- ---------------------------------------------------------------------------

-- The old signature has to go first: with both defined, task_counts() with no
-- arguments is ambiguous and Postgres refuses to choose.
drop function if exists public.task_counts();

create or replace function public.task_counts(tz text default 'UTC')
returns table (
  total       bigint,
  done        bigint,
  todo        bigint,
  in_progress bigint,
  in_review   bigint,
  overdue     bigint,
  due_today   bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  with zone as (
    select coalesce(
      (select name from pg_timezone_names where name = tz),
      'UTC'
    ) as name
  )
  select
    count(*)                                                        as total,
    count(*) filter (where t.status = 'done')                       as done,
    count(*) filter (where t.status = 'todo')                       as todo,
    count(*) filter (where t.status = 'in_progress')                as in_progress,
    count(*) filter (where t.status = 'in_review')                  as in_review,
    count(*) filter (where t.status <> 'done' and t.due_at < now()) as overdue,
    count(*) filter (
      where t.status <> 'done'
        and t.due_at is not null
        -- Both sides converted to wall-clock time in the viewer's zone, then
        -- compared as dates: exactly what the browser does.
        and (t.due_at at time zone z.name)::date = (now() at time zone z.name)::date
    )                                                               as due_today
  from public.tasks t
  cross join zone z;
$$;

comment on function public.task_counts(text) is
  'Dashboard figures under the caller''s RLS. Pass an IANA timezone so "due today" means the viewer''s day; unknown names fall back to UTC.';

grant execute on function public.task_counts(text) to authenticated;

-- =========================================================================
-- 20260914000019_shared_notes.sql
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Sharing a list
--
-- My List was built for exactly one reader — no manager override, no admin
-- override — and that stays true of every list nobody has been invited to.
-- What changes is that the owner can invite specific people, one list at a
-- time, and take the invitation back.
--
-- Who can do what on a shared list:
--
--   owner         everything, including deleting the list and managing who
--                 else is on it
--   collaborator  read it, write its text, and add, tick, edit or remove
--                 lines — a shared checklist that only one person may tick is
--                 not a shared checklist
--   collaborator  may also remove themselves, which is how you leave a list
--   anyone else   nothing, exactly as before
--
-- Ownership never moves: the guard below pins user_id through every update,
-- so a collaborator cannot make a list theirs.
-- ---------------------------------------------------------------------------

create table if not exists public.personal_note_shares (
  note_id  uuid not null references public.personal_notes (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),

  primary key (note_id, user_id)
);

create index if not exists personal_note_shares_user_idx
  on public.personal_note_shares (user_id);

comment on table public.personal_note_shares is
  'Who a personal list has been shared with. Absence of a row is privacy.';

-- --------------------------------------------------------------------------
-- Visibility helpers
--
-- SECURITY DEFINER so they can read the notes and shares tables without going
-- through the policies that are themselves written in terms of them.
-- --------------------------------------------------------------------------

create or replace function public.owns_note(note uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.personal_notes n
     where n.id = note and n.user_id = auth.uid()
  );
$$;

create or replace function public.can_view_note(note uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.owns_note(note)
    or exists (
      select 1 from public.personal_note_shares s
       where s.note_id = note and s.user_id = auth.uid()
    );
$$;

grant execute on function public.owns_note(uuid) to authenticated;
grant execute on function public.can_view_note(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Ownership and parentage are not editable
--
-- Without this an update could rewrite user_id — handing a list to yourself,
-- or away to somebody else — or move a line onto a different note.
-- --------------------------------------------------------------------------

create or replace function public.guard_note_owner()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists personal_notes_guard_owner on public.personal_notes;
create trigger personal_notes_guard_owner
  before update on public.personal_notes
  for each row execute function public.guard_note_owner();

create or replace function public.guard_note_item_parent()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  new.note_id := old.note_id;
  return new;
end;
$$;

drop trigger if exists personal_note_items_guard_parent on public.personal_note_items;
create trigger personal_note_items_guard_parent
  before update on public.personal_note_items
  for each row execute function public.guard_note_item_parent();

-- --------------------------------------------------------------------------
-- Notes: read and write for everyone on the list, delete for its owner
-- --------------------------------------------------------------------------

alter table public.personal_note_shares enable row level security;
alter table public.personal_note_shares force row level security;

drop policy if exists "own notes are readable" on public.personal_notes;
drop policy if exists "notes are readable by their people" on public.personal_notes;
create policy "notes are readable by their people"
  on public.personal_notes for select
  to authenticated
  using (public.can_view_note(id));

drop policy if exists "own notes are updatable" on public.personal_notes;
drop policy if exists "notes are writable by their people" on public.personal_notes;
create policy "notes are writable by their people"
  on public.personal_notes for update
  to authenticated
  using (public.can_view_note(id))
  with check (public.can_view_note(id));

-- Deleting somebody's list is not collaboration. A collaborator leaves by
-- removing their own share row instead.
drop policy if exists "own notes are deletable" on public.personal_notes;
drop policy if exists "notes are deletable by their owner" on public.personal_notes;
create policy "notes are deletable by their owner"
  on public.personal_notes for delete
  to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- Lines: whoever can see the list can work it
--
-- The item policies used to be a plain user_id check, which is why the column
-- was denormalised onto the row in the first place. It stays — as a record of
-- who added a line — but visibility now resolves through the note, because on
-- a shared list the lines are not all the same person's.
-- --------------------------------------------------------------------------

drop policy if exists "own note items are readable" on public.personal_note_items;
drop policy if exists "note items are readable by their people" on public.personal_note_items;
create policy "note items are readable by their people"
  on public.personal_note_items for select
  to authenticated
  using (public.can_view_note(note_id));

drop policy if exists "own note items are writable" on public.personal_note_items;
drop policy if exists "note items are writable by their people" on public.personal_note_items;
create policy "note items are writable by their people"
  on public.personal_note_items for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_note(note_id));

drop policy if exists "own note items are updatable" on public.personal_note_items;
drop policy if exists "note items are updatable by their people" on public.personal_note_items;
create policy "note items are updatable by their people"
  on public.personal_note_items for update
  to authenticated
  using (public.can_view_note(note_id))
  with check (public.can_view_note(note_id));

drop policy if exists "own note items are deletable" on public.personal_note_items;
drop policy if exists "note items are deletable by their people" on public.personal_note_items;
create policy "note items are deletable by their people"
  on public.personal_note_items for delete
  to authenticated
  using (public.can_view_note(note_id));

-- --------------------------------------------------------------------------
-- The share rows themselves
-- --------------------------------------------------------------------------

drop policy if exists "shares are readable by their people" on public.personal_note_shares;
create policy "shares are readable by their people"
  on public.personal_note_shares for select
  to authenticated
  using (public.can_view_note(note_id));

-- Only the owner invites, and never themselves — they are already on it.
drop policy if exists "owners share their notes" on public.personal_note_shares;
create policy "owners share their notes"
  on public.personal_note_shares for insert
  to authenticated
  with check (
    public.owns_note(note_id)
    and added_by = auth.uid()
    and user_id <> auth.uid()
  );

-- The owner removes anybody; everybody else may remove themselves, which is
-- what leaving a list means.
drop policy if exists "owners and leavers remove shares" on public.personal_note_shares;
create policy "owners and leavers remove shares"
  on public.personal_note_shares for delete
  to authenticated
  using (public.owns_note(note_id) or user_id = auth.uid());

grant select, insert, delete on public.personal_note_shares to authenticated;

-- --------------------------------------------------------------------------
-- Realtime
--
-- A shared list that only updates on reload is a worse shared list. Realtime
-- applies RLS to every change it forwards, so publishing these does not widen
-- who can see what.
-- --------------------------------------------------------------------------

do $$
declare
  target text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found — skipping';
    return;
  end if;

  foreach target in array array['personal_notes', 'personal_note_items']
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

-- A deleted line has to say which note it belonged to, and the payload for a
-- delete carries only the identifying columns unless the whole row is kept.
alter table public.personal_note_items replica identity full;
