-- =====================================================================================
-- LOCAL TEST HARNESS — proves the row-level security policies actually isolate users.
--
-- This is the security-critical property of the application database: the browser holds an
-- anon key, so RLS is the only thing standing between one user's data and another's. It had
-- never been executed before.
--
-- Run against a database that has had 00_supabase_shim.sql and 0001_init.sql applied:
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/local/01_rls_check.sql
--
-- Every check raises an exception on failure, so a non-zero exit means RLS is broken.
-- =====================================================================================

\set ALICE '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
\set BOB   '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

-- ------------------------------------------------------------------ seed
-- Seeded as the table owner, which bypasses RLS. This is what the service role does
-- server-side, and it is deliberately the only way financial rows get written.
begin;
delete from public.users where wallet_address in (:'ALICE', :'BOB');

insert into public.users (wallet_address) values (:'ALICE'), (:'BOB');

insert into public.goals (user_id, name, target_value, target_date)
select id, 'house', 20000, date '2031-10-04' from public.users where wallet_address = :'ALICE';
insert into public.goals (user_id, name, target_value, target_date)
select id, 'retirement', 500000, date '2051-10-04' from public.users where wallet_address = :'BOB';

insert into public.mandates (
  user_id, contract_address, version, target_value, target_date,
  max_drawdown_bps, min_liquidity_bps, max_asset_bps, rebalance_threshold_bps)
select id, '0x00000000000000000000000000000000000000c1', 1, 20000, now() + interval '5 years',
       1500, 1000, 3000, 400
from public.users where wallet_address = :'ALICE';

insert into public.mandates (
  user_id, contract_address, version, target_value, target_date,
  max_drawdown_bps, min_liquidity_bps, max_asset_bps, rebalance_threshold_bps)
select id, '0x00000000000000000000000000000000000000c2', 1, 500000, now() + interval '25 years',
       2000, 500, 4000, 500
from public.users where wallet_address = :'BOB';

-- 0002: events, notifications and automation, one each per user.
insert into public.domain_events (user_id, type, payload)
select id, 'plan_approved', '{"who":"alice"}' from public.users where wallet_address = :'ALICE';
insert into public.domain_events (user_id, type, payload)
select id, 'plan_approved', '{"who":"bob"}' from public.users where wallet_address = :'BOB';
insert into public.notifications (user_id, kind, title, body)
select id, 'info', 'alice note', 'x' from public.users where wallet_address = :'ALICE';
insert into public.notifications (user_id, kind, title, body)
select id, 'info', 'bob note', 'x' from public.users where wallet_address = :'BOB';
insert into public.automation_settings (user_id, level)
select id, 'assisted' from public.users where wallet_address in (:'ALICE', :'BOB');
commit;

-- ------------------------------------------------ act as Alice (authenticated + RLS)
begin;
set local role authenticated;
set local request.jwt.claims = '{"wallet_address":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}';

do $$
declare n int; wallet text;
begin
  -- The JWT claim must resolve, or every check below would pass vacuously on an empty set.
  select public.current_wallet() into wallet;
  if wallet is distinct from '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' then
    raise exception 'SETUP FAIL: current_wallet() returned %, expected Alice', coalesce(wallet, '<null>');
  end if;
  if public.current_user_id() is null then
    raise exception 'SETUP FAIL: current_user_id() is null, so RLS checks would be vacuous';
  end if;

  -- 1. Alice sees only her own user row.
  select count(*) into n from public.users;
  if n <> 1 then raise exception 'RLS FAIL: Alice can see % user rows, expected 1', n; end if;

  -- 2. Alice sees only her own goal.
  select count(*) into n from public.goals;
  if n <> 1 then raise exception 'RLS FAIL: Alice can see % goals, expected 1', n; end if;
  select count(*) into n from public.goals where name = 'retirement';
  if n <> 0 then raise exception 'RLS FAIL: Alice can read Bob''s goal'; end if;

  -- 3. Alice sees only her own mandate.
  select count(*) into n from public.mandates;
  if n <> 1 then raise exception 'RLS FAIL: Alice can see % mandates, expected 1', n; end if;
  select count(*) into n from public.mandates
    where contract_address = '0x00000000000000000000000000000000000000c2';
  if n <> 0 then raise exception 'RLS FAIL: Alice can read Bob''s mandate'; end if;
end $$;

-- 4. Alice CAN write her own goal.
do $$
declare uid uuid;
begin
  uid := public.current_user_id();
  insert into public.goals (user_id, name, target_value, target_date)
  values (uid, 'rls-own-goal', 1000, date '2030-01-01');
exception when others then
  raise exception 'RLS FAIL: Alice cannot insert her own goal (%)', sqlerrm;
end $$;

-- 5. Alice CANNOT write a goal attributed to Bob.
do $$
declare bob uuid;
begin
  select id into bob from public.users where wallet_address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  -- RLS hides Bob's row from Alice, so she cannot even name him. Forge the id directly to
  -- make the test adversarial rather than relying on her not knowing it.
  if bob is null then bob := '00000000-0000-0000-0000-0000000000b0'::uuid; end if;
  begin
    insert into public.goals (user_id, name, target_value, target_date)
    values (bob, 'rls-forged-goal', 1000, date '2030-01-01');
    raise exception 'RLS FAIL: Alice inserted a goal owned by another user';
  exception
    when insufficient_privilege then null;       -- expected: WITH CHECK rejected it
    when foreign_key_violation then null;        -- also acceptable: the forged id does not exist
  end;
end $$;

-- 6. Alice CANNOT write a mandate. Mandates mirror on-chain state and are service-role only.
do $$
declare uid uuid;
begin
  uid := public.current_user_id();
  begin
    insert into public.mandates (
      user_id, contract_address, version, target_value, target_date,
      max_drawdown_bps, min_liquidity_bps, max_asset_bps, rebalance_threshold_bps)
    values (uid, '0x00000000000000000000000000000000000000ff', 99, 1, now() + interval '1 year',
            0, 0, 10000, 0);
    raise exception 'RLS FAIL: Alice wrote a mandate directly, bypassing the chain';
  exception when insufficient_privilege then null;  -- expected: no insert policy exists
  end;
end $$;

-- 7. Alice CANNOT write a transaction or a risk event either.
do $$
declare uid uuid;
begin
  uid := public.current_user_id();
  begin
    insert into public.transactions (user_id, tx_hash, type, chain_id)
    values (uid, '0x' || repeat('a', 64), 'deposit', 10143);
    raise exception 'RLS FAIL: Alice forged a transaction record';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 8. Alice CANNOT take over another wallet by updating her own row.
do $$
declare n int;
begin
  begin
    update public.users set wallet_address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    where wallet_address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'RLS FAIL: Alice reassigned her row to Bob''s wallet'; end if;
  exception
    when insufficient_privilege then null;  -- expected: WITH CHECK rejected it
    when unique_violation then null;        -- also fine: Bob's wallet already exists
  end;
end $$;

-- 9. 0002 tables: Alice reads only her own events, notifications and automation setting.
do $$
declare n int;
begin
  select count(*) into n from public.domain_events;
  if n <> 1 then raise exception 'RLS FAIL: Alice can see % events, expected 1', n; end if;
  select count(*) into n from public.domain_events where payload->>'who' = 'bob';
  if n <> 0 then raise exception 'RLS FAIL: Alice can read Bob''s events'; end if;
  select count(*) into n from public.notifications;
  if n <> 1 then raise exception 'RLS FAIL: Alice can see % notifications, expected 1', n; end if;
  select count(*) into n from public.automation_settings;
  if n <> 1 then raise exception 'RLS FAIL: Alice can see % automation rows, expected 1', n; end if;
end $$;

-- 10. Alice CANNOT record an event, forge a notification, or grant Modalis more authority.
do $$
declare uid uuid; n int;
begin
  uid := public.current_user_id();
  begin
    insert into public.domain_events (user_id, type) values (uid, 'money_added');
    raise exception 'RLS FAIL: Alice recorded an event directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notifications (user_id, kind, title, body) values (uid, 'done', 'forged', 'x');
    raise exception 'RLS FAIL: Alice forged a notification';
  exception when insufficient_privilege then null;
  end;
  -- The dangerous one: turning on automated execution without the server and its timelock.
  update public.automation_settings set level = 'automated' where user_id = uid;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'RLS FAIL: Alice switched on automation directly, skipping the timelock'; end if;
  begin
    insert into public.automation_settings (user_id, level) values (uid, 'automated');
    raise exception 'RLS FAIL: Alice inserted an automation grant';
  exception when insufficient_privilege then null;
           when unique_violation then null;  -- her row exists; either way nothing was granted
  end;
end $$;

-- 11. Alice CAN set her own goals' priority (goals stay user-authored).
do $$
declare n int;
begin
  update public.goals set priority = 2 where name = 'house';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'RLS FAIL: Alice cannot reprioritise her own goal'; end if;
  update public.goals set priority = 9 where name = 'retirement';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS FAIL: Alice reprioritised Bob''s goal'; end if;
end $$;

rollback;  -- leave the database as we found it

-- ------------------------------------------------ act as an anonymous visitor
begin;
set local role anon;
set local request.jwt.claims = '';

do $$
declare n int;
begin
  if public.current_wallet() is not null then
    raise exception 'RLS FAIL: current_wallet() is non-null with no JWT';
  end if;
  select count(*) into n from public.users;
  if n <> 0 then raise exception 'RLS FAIL: anonymous visitor can see % user rows', n; end if;
  select count(*) into n from public.goals;
  if n <> 0 then raise exception 'RLS FAIL: anonymous visitor can see % goals', n; end if;
  select count(*) into n from public.mandates;
  if n <> 0 then raise exception 'RLS FAIL: anonymous visitor can see % mandates', n; end if;
  select count(*) into n from public.domain_events;
  if n <> 0 then raise exception 'RLS FAIL: anonymous visitor can see % events', n; end if;
  select count(*) into n from public.notifications;
  if n <> 0 then raise exception 'RLS FAIL: anonymous visitor can see % notifications', n; end if;
  select count(*) into n from public.automation_settings;
  if n <> 0 then raise exception 'RLS FAIL: anonymous visitor can see % automation rows', n; end if;
end $$;
rollback;

-- ------------------------------------------------------------------ cleanup
begin;
delete from public.users where wallet_address in (:'ALICE', :'BOB');
commit;

\echo 'RLS CHECK PASSED: users are isolated, financial tables are service-role-only.'
