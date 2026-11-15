-- Phase 3 ledger tables. Additive only: nothing in the app reads these yet.
-- Conventions follow public.trades: id is text (client ids are base36
-- timestamps, not uuids), account_id is the stable fk and account_name is a
-- denormalised copy kept in step by the rename path.

create table if not exists public.withdrawals (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  account_id    uuid references public.accounts(id) on delete set null,
  account_name  text,
  wd_date       date,
  amount        numeric,
  note          text,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.holdings (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  account_id     uuid references public.accounts(id) on delete set null,
  account_name   text,
  symbol         text,
  qty            numeric,
  price_paid     numeric,
  last_price     numeric,
  market_value   numeric,
  days_gain      numeric,
  total_gain     numeric,
  total_gain_pct numeric,
  total_cost     numeric,
  as_of          timestamptz,
  data           jsonb not null default '{}'::jsonb,
  deleted        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.holding_snapshots (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete set null,
  account_name text,
  cash         numeric,
  summary      jsonb not null default '{}'::jsonb,
  as_of        timestamptz,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.transactions (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete set null,
  account_name text,
  txn_date     date,
  act_type     text,
  description  text,
  symbol       text,
  underlying   text,
  opt_type     text,
  strike       numeric,
  expiry       date,
  qty          numeric,
  price        numeric,
  amount       numeric,
  commission   numeric,
  data         jsonb not null default '{}'::jsonb,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists withdrawals_user_idx    on public.withdrawals (user_id, wd_date desc);
create index if not exists withdrawals_acct_idx    on public.withdrawals (account_id);
create index if not exists holdings_user_idx       on public.holdings (user_id, account_id);
create index if not exists holdings_symbol_idx     on public.holdings (user_id, symbol);
create index if not exists holding_snap_user_idx   on public.holding_snapshots (user_id, account_id);
create index if not exists transactions_user_idx   on public.transactions (user_id, txn_date desc);
create index if not exists transactions_acct_idx   on public.transactions (account_id);
create index if not exists transactions_symbol_idx on public.transactions (user_id, underlying);
