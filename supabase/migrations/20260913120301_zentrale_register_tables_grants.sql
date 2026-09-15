revoke all on table public.operational_persons from public, anon;
revoke all on table public.operational_objects from public, anon;
grant select, insert, update, delete on table public.operational_persons to authenticated;
grant select, insert, update, delete on table public.operational_objects to authenticated;

do $$
declare t text;
begin
  foreach t in array array['zentrale_av_bv','zentrale_fahndungen','zentrale_schluessel','zentrale_kontakte','zentrale_alarmierung','zentrale_unterlagen'] loop
    execute format('revoke all on table public.%1$s from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%1$s to authenticated', t);
  end loop;
end $$;
