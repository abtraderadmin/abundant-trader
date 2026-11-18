-- The last durable data still living only in the blob.
--
-- Not given tables, deliberately:
--   ore            scratchpad of fetched bars/EMAs/pivots for the ticker on
--                  screen; re-derivable, replaced on every analysis
--   importQueue    transient staging between parse and decision
--   portfolioOpen  UI state (which panel is expanded)

create table if not exists public.opportunities (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  ticker         text, status text, route_decision text, source text, direction text,
  analysis_date  date,
  price numeric, entry numeric, stop numeric, target numeric,
  support numeric, resistance numeric, rr numeric, shares numeric, total_risk numeric,
  setup text, condition text, note text,
  data           jsonb not null default '{}'::jsonb,
  deleted        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.archer_signals (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null,
  ticker text, direction text,
  session_date date, signal_date date, signal_time text,
  entry numeric, stop numeric, target numeric, score numeric,
  verdict text, added_at timestamptz,
  data         jsonb not null default '{}'::jsonb,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.class_sessions (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  label text, session_date date, source text,
  class_wins numeric, session_notes text,
  tickers       jsonb not null default '[]'::jsonb,
  data          jsonb not null default '{}'::jsonb,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.class_analysis (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  ticker     text,
  data       jsonb not null default '{}'::jsonb,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_user_idx   on public.opportunities (user_id, status);
create index if not exists opportunities_ticker_idx on public.opportunities (user_id, ticker);
create index if not exists archer_signals_user_idx  on public.archer_signals (user_id, kind, session_date desc);
create index if not exists class_sessions_user_idx  on public.class_sessions (user_id, session_date desc);
create index if not exists class_analysis_user_idx  on public.class_analysis (user_id, ticker);
