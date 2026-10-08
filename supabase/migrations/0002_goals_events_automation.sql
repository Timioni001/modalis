-- =====================================================================================
-- MODALIS 0002 — several goals, why a plan changed, what happened, and how much may happen alone.
--
-- Re-appliable: every statement is guarded, so running the migrations folder twice is a no-op.
--
-- Ownership model, unchanged from 0001:
--   * goals are USER-AUTHORED, so the browser may write its own rows under RLS.
--   * everything that records something that HAPPENED — events, notifications — and everything
--     that grants Modalis authority — automation — is written by the server with the service
--     role only. The browser can read its own rows and nothing else.
-- =====================================================================================

-- ------------------------------------------------------------------ goals: several, ranked
-- §5 lists these alongside the original six.
alter type goal_type add value if not exists 'major_purchase';
alter type goal_type add value if not exists 'travel';

-- Lower number = funded first. Ties fall back to creation order in the domain layer, so a
-- reorder never needs a unique constraint juggled mid-update.
alter table public.goals add column if not exists priority integer not null default 1;
alter table public.goals drop constraint if exists goals_priority_positive;
alter table public.goals add constraint goals_priority_positive check (priority >= 1);

-- How much of this goal's money must stay reachable (§5 "liquidity requirement").
alter table public.goals add column if not exists liquidity_need text not null default 'some';
alter table public.goals drop constraint if exists goals_liquidity_need_valid;
alter table public.goals add constraint goals_liquidity_need_valid
  check (liquidity_need in ('none', 'some', 'significant'));

create index if not exists goals_user_priority_idx on public.goals(user_id, priority);

-- ------------------------------------------------------------------ plan versions (§14)
-- mandates is already one row per approved version, unique per (user, contract, version), with
-- mandate_changes holding the diff. What it lacked was WHY each version exists.
alter table public.mandates add column if not exists change_reason text;
alter table public.mandates drop constraint if exists mandates_change_reason_len;
alter table public.mandates add constraint mandates_change_reason_len
  check (change_reason is null or length(change_reason) <= 500);

-- ------------------------------------------------------------------ domain events (§37)
-- An append-only record of things that happened. The activity screen, notifications and audit
-- all read from here. Never updated, never deleted except with the user.
create table if not exists public.domain_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  goal_id      uuid references public.goals(id) on delete set null,
  type         text not null check (type in (
                 'goal_created', 'goal_updated', 'goal_reprioritised',
                 'plan_approved', 'plan_paused', 'plan_resumed',
                 'money_added', 'money_withdrawn',
                 'adjustment_proposed', 'adjustment_executed', 'adjustment_blocked',
                 'glide_step_due', 'goal_milestone',
                 'automation_requested', 'automation_effective', 'safety_restriction')),
  payload      jsonb not null default '{}'::jsonb,
  tx_hash      text check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  occurred_at  timestamptz not null default now()
);
create index if not exists domain_events_user_idx on public.domain_events(user_id, occurred_at desc);
-- The same transaction must not be recorded as the same event twice (retries, replays).
create unique index if not exists domain_events_tx_once
  on public.domain_events(user_id, type, tx_hash) where tx_hash is not null;

-- ------------------------------------------------------------------ notifications (§36)
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  event_id    uuid references public.domain_events(id) on delete cascade,
  kind        text not null check (kind in ('info', 'attention', 'done', 'safety')),
  title       text not null check (length(title) between 1 and 120),
  body        text not null check (length(body) <= 600),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create unique index if not exists notifications_event_once on public.notifications(event_id)
  where event_id is not null;

-- ------------------------------------------------------------------ automation (§18, §33)
-- How much Modalis may do without asking. Raising it is timelocked: the requested level only
-- takes effect at effective_at. Lowering it is immediate — reducing authority must never wait.
create table if not exists public.automation_settings (
  user_id          uuid primary key references public.users(id) on delete cascade,
  level            text not null default 'assisted' check (level in ('guided', 'assisted', 'automated')),
  requested_level  text check (requested_level in ('guided', 'assisted', 'automated')),
  effective_at     timestamptz,
  updated_at       timestamptz not null default now(),
  check ((requested_level is null) = (effective_at is null))
);
drop trigger if exists automation_touch on public.automation_settings;
create trigger automation_touch before update on public.automation_settings
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ row-level security
alter table public.domain_events       enable row level security;
alter table public.notifications       enable row level security;
alter table public.automation_settings enable row level security;

drop policy if exists domain_events_select_own on public.domain_events;
create policy domain_events_select_own on public.domain_events for select
  using (user_id = public.current_user_id());

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select
  using (user_id = public.current_user_id());

drop policy if exists automation_select_own on public.automation_settings;
create policy automation_select_own on public.automation_settings for select
  using (user_id = public.current_user_id());

-- No insert/update/delete policies on any of the three: the browser cannot record an event,
-- forge a notification, or grant Modalis more authority. Only the service role writes them.
-- (Supabase grants every role table access by default; these policies are the actual guard.)
