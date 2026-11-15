-- Least privilege on every public table.
--
-- TRUNCATE bypasses RLS entirely, so holding it defeats row isolation.
-- REFERENCES and TRIGGER are not needed by the client either.
-- anon (signed-out) should hold nothing at all on these tables.
--
-- Kept: SELECT/INSERT/UPDATE for app writes, DELETE on app_state only
-- (its "delete own state" policy needs it), SELECT only on
-- app_state_history so history stays tamper-resistant.

revoke all on public.accounts          from anon;
revoke all on public.app_state         from anon;
revoke all on public.app_state_history from anon;
revoke all on public.risk_plans        from anon;

revoke truncate, references, trigger on public.accounts          from authenticated;
revoke truncate, references, trigger on public.app_state         from authenticated;
revoke truncate, references, trigger on public.app_state_history from authenticated;
revoke truncate, references, trigger on public.risk_plans        from authenticated;

-- Re-assert the intended set, so this migration is self-contained.
grant select, insert, update         on public.accounts          to authenticated;
grant select, insert, update         on public.risk_plans        to authenticated;
grant select, insert, update, delete on public.app_state         to authenticated;
grant select                         on public.app_state_history to authenticated;

-- Trigger functions are not meant to be callable over the REST API.
-- Trigger execution does not re-check EXECUTE on the invoking role,
-- so the triggers on app_state keep working.
revoke execute on function public.snapshot_app_state() from anon, authenticated;
revoke execute on function public.rls_auto_enable()    from anon, authenticated;

-- Pin search_path on the SECURITY DEFINER / trigger functions.
alter function public.touch_updated_at()   set search_path = pg_catalog, public;
alter function public.snapshot_app_state() set search_path = pg_catalog, public;
