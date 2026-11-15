# Supabase — schema history

Migration files for the Abundant Trader database
(project `fnvithpcmwfmljtqvkun`, `abundant-trader`).

## What this is, and is not

These files are the **record** of what has been applied. The database is
currently changed through the Supabase MCP connector (`apply_migration`),
not by this folder.

The GitHub ↔ Supabase integration is deliberately **not** enabled. With the
connector already able to apply migrations, enabling it would create a second
independent path that can alter the schema — which is how environments drift.
Worth revisiting when there is a team and a pull-request flow.

If it is enabled later, this folder is already in the layout it expects
(`supabase/migrations/<timestamp>_<name>.sql`); a `config.toml` would need
adding.

## Applied

| File | Applied via | Notes |
|---|---|---|
| `001_accounts_and_risk_plans` | SQL editor | Created `accounts` + `risk_plans`. **Shipped without grants** — see 002. |
| `002_grants` | SQL editor | Fixed `42501 permission denied`. |
| `003_least_privilege_grants` | MCP | Revoked TRUNCATE/REFERENCES/TRIGGER; `anon` down to nothing. |
| `004_revoke_trigger_function_execute_from_public` | MCP | 003 missed the `PUBLIC` grant, so the functions stayed exposed. |

001 and 002 predate the migration history table, so they are not listed by
`list_migrations`. Both are written defensively (`if not exists`,
`drop ... if exists`) and are safe to replay.

## The rule that cost us an afternoon

**Every new table needs all three: RLS, a policy, and a GRANT.**

Postgres checks GRANT first and RLS second. A table with perfect policies and
no grant is simply closed — and the error surfaces in the browser console, not
anywhere near the migration. Tables created through the Supabase dashboard get
grants automatically. Tables created with SQL do not.

Migration 001 had two of the three.

## Checking before and after

Run before and after any schema change:

```sql
select c.relname as table_name,
       c.relrowsecurity as rls_on,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
       coalesce((select string_agg(distinct g.privilege_type, ',' order by g.privilege_type)
                 from information_schema.role_table_grants g
                 where g.table_schema = 'public' and g.table_name = c.relname
                   and g.grantee = 'authenticated'), '(none)') as authenticated_grants
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relname;
```

Supabase's own linter catches more (`get_advisors`, security type) and should
be run after every DDL change.

## Current state

```
accounts           authenticated   SELECT, INSERT, UPDATE
risk_plans         authenticated   SELECT, INSERT, UPDATE
app_state          authenticated   SELECT, INSERT, UPDATE, DELETE
app_state_history  authenticated   SELECT
anon               nothing, on any table
```

An event trigger, `rls_auto_enable()`, turns RLS on automatically for any new
table in `public`. Keep it. It is not a substitute for a policy or a grant.

## Outstanding

- Leaked password protection is disabled (dashboard toggle, not SQL).
- Public sign-up is open — close it before inviting anyone.
