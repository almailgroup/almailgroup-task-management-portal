-- ---------------------------------------------------------------------------
-- A minimal stand-in for the parts of Supabase the schema leans on, so the
-- migrations — and the policy tests beside this file — can be applied to a
-- plain PostgreSQL instance in CI.
--
-- It provides only what the schema references: the auth schema and its users
-- table, auth.uid() (which here reads a setting the tests set to say who they
-- are), the three Supabase roles, and the realtime publication. It is not a
-- Supabase emulator and is not used anywhere but in tests.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- auth.uid() reads whoever the test has declared itself to be.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$ select 'authenticated'::text $$;

-- Realtime publication the migrations add tables to.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;
grant usage on schema auth to authenticated, anon, service_role;
