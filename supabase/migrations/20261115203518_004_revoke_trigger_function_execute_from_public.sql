-- Postgres grants EXECUTE on new functions to PUBLIC by default, and
-- anon/authenticated inherit it. Revoking from those two roles alone left
-- the PUBLIC grant in place, so both functions stayed exposed over
-- /rest/v1/rpc/. Revoke from PUBLIC to actually close it.
--
-- Safe for the triggers: PostgreSQL checks EXECUTE on a trigger function
-- when the trigger is CREATED, not each time it fires.

revoke execute on function public.snapshot_app_state() from public;
revoke execute on function public.rls_auto_enable()    from public;
