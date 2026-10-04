-- =====================================================================================
-- MODALIS — application database (Supabase / PostgreSQL)
--
-- Division of labour:
--   * Postgres (this file) = APPLICATION state: users, goals, interview/AI output, proposals,
--     explanations, cached snapshots for fast UI.
--   * Monad contracts      = source of truth for mandate rules, balances, executions.
--   * Envio HyperIndex     = chain-derived history. Tables below that mirror chain data
--     (mandates, snapshots, positions, transactions, risk_events) are CACHES written by the
--     backend/risk-monitor with the service role, never by the browser.
--
-- Auth model: Dynamic issues a JWT containing a `wallet_address` claim, configured in Supabase as a
-- third-party / custom JWT provider. RLS keys off that claim. The browser can only READ its own rows
-- (and write goals / interview answers). Everything financial is written server-side.
-- =====================================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ enums
do $$ begin
  create type goal_type as enum ('house','education','long_term_wealth','emergency_reserve','retirement','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type goal_status as enum ('draft','active','achieved','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_status as enum ('proposed','validated','submitted','executed','rejected','expired','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tx_type as enum ('mandate_set','deposit','withdraw','rebalance','emergency_withdraw','approve','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tx_status as enum ('pending','confirmed','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_event_type as enum ('drift','concentration','liquidity','drawdown','goal_off_track','stale_price','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_severity as enum ('info','warning','breach');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ helpers
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Wallet address from the verified JWT, normalised to lowercase.
create or replace function public.current_wallet() returns text
language sql stable as $$
  select lower(nullif(auth.jwt() ->> 'wallet_address', ''))
$$;

-- App user id for the caller (null if not signed in / not yet provisioned).
create or replace function public.current_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.users where wallet_address = public.current_wallet()
$$;

-- ------------------------------------------------------------------ users
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null unique check (wallet_address = lower(wallet_address) and wallet_address ~ '^0x[0-9a-f]{40}$'),
  dynamic_user_id text unique,                 -- Dynamic's user id (embedded wallet owner)
  email           text,
  display_name    text,
  chain_id        integer not null default 10143,   -- 143 mainnet / 10143 testnet
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ goals
create table if not exists public.goals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  type                 goal_type not null default 'custom',
  name                 text not null,
  status               goal_status not null default 'draft',
  target_value         numeric(38,6) not null check (target_value > 0),     -- USD
  target_date          date not null,
  initial_amount       numeric(38,6) not null default 0 check (initial_amount >= 0),
  contribution_amount  numeric(38,6) not null default 0 check (contribution_amount >= 0),
  contribution_cadence text not null default 'monthly' check (contribution_cadence in ('weekly','monthly','quarterly')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals(user_id);
create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ interview + AI profile
-- Raw behavioural answers and the structured profile the Goal Interpreter / Risk Profiler derived.
-- AI output is stored as validated JSON (schema-checked in packages/ai before insert).
create table if not exists public.interview_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  goal_id         uuid references public.goals(id) on delete set null,
  answers         jsonb not null default '{}'::jsonb,   -- scenario-based questionnaire answers
  parsed_goal     jsonb,                                -- {goal_type,target_value,horizon_months}
  risk_profile    jsonb,                                -- {risk_capacity,risk_tolerance,liquidity_requirement,...}
  allocation_plan jsonb,                                -- {"mBTC":0.35,...} (validated, sums to 1)
  model           text,                                 -- model identifier used
  created_at      timestamptz not null default now()
);
create index if not exists interview_user_idx on public.interview_sessions(user_id, created_at desc);

-- ------------------------------------------------------------------ mandates (cache of onchain policy)
create table if not exists public.mandates (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  goal_id                   uuid references public.goals(id) on delete set null,
  contract_address          text not null check (contract_address = lower(contract_address)),  -- PortfolioMandate
  vault_address             text check (vault_address = lower(vault_address)),
  version                   integer not null check (version >= 1),
  target_value              numeric(38,6) not null,
  target_date               timestamptz not null,
  max_drawdown_bps          integer not null check (max_drawdown_bps between 0 and 10000),
  min_liquidity_bps         integer not null check (min_liquidity_bps between 0 and 10000),
  max_asset_bps             integer not null check (max_asset_bps between 1 and 10000),
  rebalance_threshold_bps   integer not null check (rebalance_threshold_bps between 0 and 10000),
  max_slippage_bps          integer not null default 200 check (max_slippage_bps between 0 and 10000),
  manager_address           text check (manager_address = lower(manager_address)),
  active                    boolean not null default true,
  set_tx_hash               text,
  created_at                timestamptz not null default now(),
  unique (user_id, contract_address, version)
);
create index if not exists mandates_user_idx on public.mandates(user_id, version desc);

-- Per-asset targets and ranges for each mandate version (mirrors PortfolioMandate.Allocation).
create table if not exists public.mandate_allocations (
  id            uuid primary key default gen_random_uuid(),
  mandate_id    uuid not null references public.mandates(id) on delete cascade,
  token_address text not null check (token_address = lower(token_address)),
  symbol        text not null,
  target_bps    integer not null check (target_bps between 0 and 10000),
  min_bps       integer not null check (min_bps between 0 and 10000),
  max_bps       integer not null check (max_bps between 0 and 10000),
  is_liquid     boolean not null default false,
  check (min_bps <= target_bps and target_bps <= max_bps),
  unique (mandate_id, token_address)
);

-- Human-readable "what changed?" between mandate versions (Mandate History feature).
create table if not exists public.mandate_changes (
  id            uuid primary key default gen_random_uuid(),
  mandate_id    uuid not null references public.mandates(id) on delete cascade,
  from_version  integer,
  to_version    integer not null,
  diff          jsonb not null,           -- {"maxSingleAsset":{"from":2000,"to":1500},...}
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ portfolio snapshots (cache)
create table if not exists public.portfolio_snapshots (
  id            uuid primary key default gen_random_uuid(),
  mandate_id    uuid not null references public.mandates(id) on delete cascade,
  taken_at      timestamptz not null default now(),
  block_number  bigint,
  total_value   numeric(38,6) not null,       -- USD
  risk_score    numeric(6,2),
  goal_progress numeric(8,6),                 -- 0..1+ (currentValue / targetValue)
  liquidity_bps integer,
  max_drift_bps integer
);
create index if not exists snapshots_mandate_time_idx on public.portfolio_snapshots(mandate_id, taken_at desc);

create table if not exists public.positions (
  id             uuid primary key default gen_random_uuid(),
  snapshot_id    uuid not null references public.portfolio_snapshots(id) on delete cascade,
  token_address  text not null check (token_address = lower(token_address)),
  symbol         text not null,
  amount         numeric(78,0) not null,      -- base units (uint256 fits in numeric(78,0))
  value          numeric(38,6) not null,      -- USD
  allocation_bps integer not null check (allocation_bps between 0 and 10000),
  unique (snapshot_id, token_address)
);

-- ------------------------------------------------------------------ rebalance proposals
-- Structured proposal produced by the Rebalance Planner. This is what gets submitted to
-- RebalanceExecutor.execute(); the contract, not this table, decides whether it is allowed.
create table if not exists public.rebalance_proposals (
  id               uuid primary key default gen_random_uuid(),
  mandate_id       uuid not null references public.mandates(id) on delete cascade,
  status           proposal_status not null default 'proposed',
  mandate_version  integer not null,
  nonce            numeric(78,0) not null,
  adapter_address  text not null check (adapter_address = lower(adapter_address)),
  token_in         text not null check (token_in = lower(token_in)),
  token_out        text not null check (token_out = lower(token_out)),
  amount_in        numeric(78,0) not null check (amount_in > 0),
  min_amount_out   numeric(78,0) not null check (min_amount_out >= 0),
  deadline         timestamptz not null,
  reason           text not null,             -- plain-language explanation shown to the user
  reason_hash      text,                      -- keccak256(reason), also emitted onchain
  allocation_before jsonb,                    -- {"mBTC":4298,...} bps
  allocation_after  jsonb,
  revert_reason    text,                      -- e.g. MAX_ALLOCATION_EXCEEDED (kept for the demo)
  is_demo_invalid  boolean not null default false,   -- the intentionally-invalid "security test" action
  created_at       timestamptz not null default now(),
  executed_at      timestamptz,
  unique (mandate_id, nonce, is_demo_invalid)
);
create index if not exists proposals_mandate_idx on public.rebalance_proposals(mandate_id, created_at desc);

-- ------------------------------------------------------------------ transactions (cache)
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  mandate_id    uuid references public.mandates(id) on delete set null,
  user_id       uuid not null references public.users(id) on delete cascade,
  proposal_id   uuid references public.rebalance_proposals(id) on delete set null,
  tx_hash       text not null unique check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  type          tx_type not null,
  status        tx_status not null default 'pending',
  chain_id      integer not null,
  block_number  bigint,
  venue         text,                          -- 'kuru' | 'mock' | ...
  details       jsonb not null default '{}'::jsonb,   -- amounts, tokens, fills
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);
create index if not exists tx_user_idx on public.transactions(user_id, created_at desc);

-- ------------------------------------------------------------------ risk events
create table if not exists public.risk_events (
  id            uuid primary key default gen_random_uuid(),
  mandate_id    uuid not null references public.mandates(id) on delete cascade,
  type          risk_event_type not null,
  severity      risk_severity not null,
  details       jsonb not null default '{}'::jsonb,
  source        text not null default 'risk-monitor',   -- 'chainlink-cre' | 'risk-monitor' | 'scenario'
  tx_hash       text,                                    -- RiskSignalReceiver write, if any
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists risk_events_mandate_idx on public.risk_events(mandate_id, created_at desc);

-- ------------------------------------------------------------------ explanations
-- Every important action gets a stored, user-readable "why".
create table if not exists public.explanations (
  id           uuid primary key default gen_random_uuid(),
  mandate_id   uuid not null references public.mandates(id) on delete cascade,
  proposal_id  uuid references public.rebalance_proposals(id) on delete cascade,
  risk_event_id uuid references public.risk_events(id) on delete cascade,
  body         text not null,
  model        text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ scenarios ("What if?")
create table if not exists public.scenarios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  goal_id     uuid references public.goals(id) on delete cascade,
  prompt      text not null,
  inputs      jsonb not null default '{}'::jsonb,
  result      jsonb,
  created_at  timestamptz not null default now()
);

-- =====================================================================================
-- ROW LEVEL SECURITY
-- =====================================================================================
alter table public.users               enable row level security;
alter table public.goals               enable row level security;
alter table public.interview_sessions  enable row level security;
alter table public.mandates            enable row level security;
alter table public.mandate_allocations enable row level security;
alter table public.mandate_changes     enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.positions           enable row level security;
alter table public.rebalance_proposals enable row level security;
alter table public.transactions        enable row level security;
alter table public.risk_events         enable row level security;
alter table public.explanations        enable row level security;
alter table public.scenarios           enable row level security;

-- users: read/update own row only. Provisioning (insert) is done server-side after Dynamic login.
create policy users_select_own on public.users for select using (wallet_address = public.current_wallet());
create policy users_update_own on public.users for update using (wallet_address = public.current_wallet())
  with check (wallet_address = public.current_wallet());

-- goals / interviews / scenarios: user-authored, full CRUD on own rows.
create policy goals_all_own on public.goals for all
  using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());
create policy interviews_all_own on public.interview_sessions for all
  using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());
create policy scenarios_all_own on public.scenarios for all
  using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());

-- mandates & everything derived from them: READ-ONLY for the browser.
-- (Mandates are created onchain by the user's wallet; the backend mirrors them with the service role.)
create policy mandates_select_own on public.mandates for select using (user_id = public.current_user_id());

create policy allocations_select_own on public.mandate_allocations for select using (
  exists (select 1 from public.mandates m where m.id = mandate_id and m.user_id = public.current_user_id()));
create policy mandate_changes_select_own on public.mandate_changes for select using (
  exists (select 1 from public.mandates m where m.id = mandate_id and m.user_id = public.current_user_id()));
create policy snapshots_select_own on public.portfolio_snapshots for select using (
  exists (select 1 from public.mandates m where m.id = mandate_id and m.user_id = public.current_user_id()));
create policy positions_select_own on public.positions for select using (
  exists (select 1 from public.portfolio_snapshots s join public.mandates m on m.id = s.mandate_id
          where s.id = snapshot_id and m.user_id = public.current_user_id()));
create policy proposals_select_own on public.rebalance_proposals for select using (
  exists (select 1 from public.mandates m where m.id = mandate_id and m.user_id = public.current_user_id()));
create policy transactions_select_own on public.transactions for select using (user_id = public.current_user_id());
create policy risk_events_select_own on public.risk_events for select using (
  exists (select 1 from public.mandates m where m.id = mandate_id and m.user_id = public.current_user_id()));
create policy explanations_select_own on public.explanations for select using (
  exists (select 1 from public.mandates m where m.id = mandate_id and m.user_id = public.current_user_id()));

-- No insert/update/delete policies on the read-only tables above: with RLS enabled that means only the
-- service role (which bypasses RLS) can write them. That is intentional.

-- =====================================================================================
-- REALTIME (live dashboard updates for transactions / proposals / risk events)
-- =====================================================================================
do $$ begin
  alter publication supabase_realtime add table public.transactions;
  alter publication supabase_realtime add table public.rebalance_proposals;
  alter publication supabase_realtime add table public.risk_events;
  alter publication supabase_realtime add table public.portfolio_snapshots;
exception when others then null; end $$;
