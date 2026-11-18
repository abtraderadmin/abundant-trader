-- Owner policies, least-privilege grants, updated_at triggers.
-- RLS arrives enabled via the rls_auto_enable event trigger and SQL-created
-- tables hold no grants. No DELETE, no TRUNCATE: removal is a tombstone.

create policy opportunities_owner_all on public.opportunities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy archer_signals_owner_all on public.archer_signals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy class_sessions_owner_all on public.class_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy class_analysis_owner_all on public.class_analysis
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.opportunities  to authenticated;
grant select, insert, update on public.archer_signals to authenticated;
grant select, insert, update on public.class_sessions to authenticated;
grant select, insert, update on public.class_analysis to authenticated;

create trigger opportunities_touch   before update on public.opportunities
  for each row execute function public.touch_updated_at();
create trigger archer_signals_touch  before update on public.archer_signals
  for each row execute function public.touch_updated_at();
create trigger class_sessions_touch  before update on public.class_sessions
  for each row execute function public.touch_updated_at();
create trigger class_analysis_touch  before update on public.class_analysis
  for each row execute function public.touch_updated_at();
