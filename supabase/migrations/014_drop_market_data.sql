-- market_data was created for an Alpha Vantage cache that was never wired up:
-- zero rows, zero references in the app, and RLS enabled with no policy, so
-- nothing could read or write it in any case.
--
-- Recreating it is this file in reverse, so nothing is lost by dropping it.
-- For reference, should the cache ever be built:
--
--   create table public.market_data (
--     id          text primary key,
--     user_id     uuid not null references auth.users(id) on delete cascade,
--     symbol      text not null,
--     kind        text not null,          -- quote | ema | atr | chain | ...
--     payload     jsonb not null default '{}'::jsonb,
--     fetched_at  timestamptz not null default now(),
--     expires_at  timestamptz,
--     updated_at  timestamptz not null default now()
--   );
--   -- and an owner policy, which the original never had.

drop table if exists public.market_data;
