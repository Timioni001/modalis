-- Contact form messages. Written only by the server (service role) after it has verified who is
-- signed in, and deleted with the rest of a person's data when they delete their account.
create table if not exists public.contact_messages (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null check (wallet_address = lower(wallet_address)),
  email           text,
  message         text not null check (char_length(message) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index if not exists contact_messages_wallet on public.contact_messages (wallet_address);

-- No policies: the browser can neither read nor write this table. Only the service role does.
alter table public.contact_messages enable row level security;
