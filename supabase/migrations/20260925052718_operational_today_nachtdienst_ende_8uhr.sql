-- Der Nachtdienst dauert tatsächlich von 19:00 bis 08:00 Uhr, nicht bis
-- 06:00 Uhr. Mit der bisherigen 6-Uhr-Grenze wechselte operational_today()
-- (und damit is_zentralist_on_duty()) schon zwei Stunden vor Dienstende auf
-- den nächsten Kalendertag - ein während dieser Zeit gemeldeter, bereits
-- erledigter Einsatz fiel dadurch sofort aus der "heutigen" Übersicht
-- (incident_reports gefiltert ab Beginn des Diensttags), während der
-- Nachtdienst selbst noch lief. Grenze an lib/zentraleShared.ts angleichen.
create or replace function public.operational_today()
returns date
language sql
stable
set search_path to ''
as $$
  select case
    when extract(hour from (now() at time zone 'Europe/Vienna')) < 8
      then ((now() at time zone 'Europe/Vienna')::date - 1)
    else (now() at time zone 'Europe/Vienna')::date
  end;
$$;
