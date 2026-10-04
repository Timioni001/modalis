-- =====================================================================================
-- LOCAL TEST HARNESS ONLY — do NOT run this against a real Supabase project.
--
-- Supabase provides `auth.jwt()` and the anon / authenticated / service_role roles itself.
-- Vanilla Postgres does not, so `0001_init.sql` cannot even be applied locally without them,
-- which is why the row-level security policies had never been executed.
--
-- This file recreates just enough of that surface to apply the real migration unchanged and
-- exercise its RLS policies locally. It mirrors Supabase's own definitions:
--   https://supabase.com/docs/guides/database/postgres/row-level-security
-- =====================================================================================

create schema if not exists auth;

-- Supabase's auth.jwt() reads the verified JWT claims the API gateway puts on the session.
-- Tests set it with:  set local request.jwt.claims = '{"wallet_address":"0x..."}';
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- The three roles Supabase ships. `anon` and `authenticated` are subject to RLS;
-- `service_role` bypasses it, which is why all financial writes use it server-side.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Match Supabase's default grants: the roles can touch every table, and RLS is what
-- actually constrains them.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
