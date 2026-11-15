-- ════════════════════════════════════════════════════════════
-- Abundant Trader AI — migration 001 (v2, simplified)
--
-- Creates two new EMPTY tables. Does not touch app_state.
-- The app does not use them yet — this is groundwork only.
--
-- Plain DDL: no functions, no triggers, no dollar-quoting.
-- updated_at is written by the app, the same way app_state is.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query
--   Paste ALL of this -> Run
--   Expect: "Success. No rows returned"
-- ════════════════════════════════════════════════════════════

-- ── ACCOUNTS ────────────────────────────────────────────────
create table if not exists public.accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  kind             text not null,
  slot             integer,
  starting_balance numeric(14,2),
  goal_monthly     numeric(14,2),
  goal_daily       numeric(14,2),
  prior_pl         numeric(14,2),
  tax_deferred     jsonb not null default '{}'::jsonb,
  archived         boolean not null default false,
  deleted          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.accounts
  drop constraint if exists accounts_kind_check;
alter table public.accounts
  add constraint accounts_kind_check
  check (kind in ('eval','pa','cash','paper'));

create index if not exists accounts_user_idx
  on public.accounts (user_id);

alter table public.accounts enable row level security;

drop policy if exists accounts_owner_all on public.accounts;
create policy accounts_owner_all on public.accounts
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── RISK_PLANS ──────────────────────────────────────────────
create table if not exists public.risk_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  uuid references public.accounts(id) on delete set null,

  mode        text not null,
  asset       text not null,
  symbol      text,
  opt_type    text,
  strike      numeric(14,4),
  expiration  date,
  is_zero_dte boolean,
  qty         integer,
  entry       numeric(14,4) not null,

  stop_basis  text not null,
  stop_pct    numeric(6,3),
  stop_at     numeric(14,4),

  max_risk    numeric(14,2),

  trail_pct   numeric(6,3),
  trail_from  numeric(14,4),

  computed    jsonb not null default '{}'::jsonb,
  notes       text,
  trade_id    uuid,

  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists risk_plans_user_created_idx
  on public.risk_plans (user_id, created_at desc);

alter table public.risk_plans enable row level security;

drop policy if exists risk_plans_owner_all on public.risk_plans;
create policy risk_plans_owner_all on public.risk_plans
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
