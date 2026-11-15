-- Owner policies, least-privilege grants and updated_at triggers.
-- RLS arrives already enabled via the rls_auto_enable event trigger, and no
-- role holds any grant on a SQL-created table, so this opens the minimum.
--
-- No DELETE and no TRUNCATE for anyone: removal is a tombstone via the
-- deleted column, same as trades. anon gets nothing.

drop policy if exists withdrawals_owner_all       on public.withdrawals;
drop policy if exists holdings_owner_all          on public.holdings;
drop policy if exists holding_snapshots_owner_all on public.holding_snapshots;
drop policy if exists transactions_owner_all      on public.transactions;

create policy withdrawals_owner_all on public.withdrawals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy holdings_owner_all on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy holding_snapshots_owner_all on public.holding_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_owner_all on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.withdrawals       to authenticated;
grant select, insert, update on public.holdings          to authenticated;
grant select, insert, update on public.holding_snapshots to authenticated;
grant select, insert, update on public.transactions      to authenticated;

drop trigger if exists withdrawals_touch       on public.withdrawals;
drop trigger if exists holdings_touch          on public.holdings;
drop trigger if exists holding_snapshots_touch on public.holding_snapshots;
drop trigger if exists transactions_touch      on public.transactions;

create trigger withdrawals_touch       before update on public.withdrawals
  for each row execute function public.touch_updated_at();
create trigger holdings_touch          before update on public.holdings
  for each row execute function public.touch_updated_at();
create trigger holding_snapshots_touch before update on public.holding_snapshots
  for each row execute function public.touch_updated_at();
create trigger transactions_touch      before update on public.transactions
  for each row execute function public.touch_updated_at();
