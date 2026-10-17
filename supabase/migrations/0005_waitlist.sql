-- Public early-access signups. The service role is the only writer; the browser never receives
-- access to this table, and duplicate addresses are idempotent.
create table if not exists public.waitlist_signups (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email = lower(email) and position('@' in email) > 1),
  source     text not null default 'landing',
  created_at timestamptz not null default now()
);

-- Keep this migration safe to rerun if the table was created from an earlier draft.
alter table public.waitlist_signups
  add column if not exists source text not null default 'landing';
alter table public.waitlist_signups
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists waitlist_signups_email_idx on public.waitlist_signups(email);
alter table public.waitlist_signups enable row level security;
