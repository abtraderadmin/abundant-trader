-- ════════════════════════════════════════════════════════════
-- Abundant Trader AI — migration 002
--
-- Fixes: 42501 "permission denied for table accounts"
--
-- Migration 001 enabled RLS and wrote the policies, but never granted
-- table privileges to the `authenticated` role. Postgres checks GRANTs
-- first and RLS second, so the app could not open the table at all.
--
-- Tables created through the Supabase dashboard get these grants
-- automatically. Tables created with raw SQL do not.
--
-- No DELETE is granted: both tables use a `deleted` flag (soft delete),
-- so nothing needs permission to actually remove rows.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste all -> Run
--   Expect: "Success. No rows returned"
-- ════════════════════════════════════════════════════════════

grant usage on schema public to authenticated;

grant select, insert, update on public.accounts   to authenticated;
grant select, insert, update on public.risk_plans to authenticated;

-- Deliberately nothing for `anon`: signed-out visitors get no access.

-- ── Verify: both tables should list the authenticated role ──
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and table_name in ('accounts','risk_plans')
--    and grantee = 'authenticated'
--  order by table_name, privilege_type;
