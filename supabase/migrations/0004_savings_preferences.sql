-- Optional, user-authored savings settings. No new permissions; the existing goals RLS applies.
alter table public.goals add column if not exists savings_preferences jsonb;
alter table public.goals drop constraint if exists goals_savings_preferences_valid;
alter table public.goals add constraint goals_savings_preferences_valid check (
  savings_preferences is null or (
    jsonb_typeof(savings_preferences) = 'object'
    and savings_preferences ? 'minimumContribution'
    and savings_preferences ? 'minimumRetrievalDays'
    and jsonb_typeof(savings_preferences->'minimumContribution') = 'string'
    and (savings_preferences->>'minimumContribution') ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
    and case when (savings_preferences->>'minimumContribution') ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
      then (savings_preferences->>'minimumContribution')::numeric between 0 and 100000 else false end
    and jsonb_typeof(savings_preferences->'minimumRetrievalDays') = 'number'
    and case when (savings_preferences->>'minimumRetrievalDays') ~ '^[0-9]{1,4}$'
      then (savings_preferences->>'minimumRetrievalDays')::integer between 0 and 3650 else false end
    and (not savings_preferences ? 'customDetails' or (
      jsonb_typeof(savings_preferences->'customDetails') = 'string'
      and length(savings_preferences->>'customDetails') <= 500))
    and (not savings_preferences ? 'startedAt' or (
      jsonb_typeof(savings_preferences->'startedAt') = 'string'
      and (savings_preferences->>'startedAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'))
  )
);
comment on column public.goals.savings_preferences is
  'Personal contribution minimum and retrieval reminder; does not lock the vault. startedAt is the approved plan block time.';
