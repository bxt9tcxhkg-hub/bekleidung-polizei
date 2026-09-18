-- Nachtdienste laufen über Mitternacht hinaus, sind aber immer noch mit dem
-- Kalendertag ihres Beginns als duty_date erfasst (z. B. Nachtdienst
-- 18.9. 19 Uhr bis 19.9. 6 Uhr -> duty_date=18.9.). is_zentralist_on_duty()
-- verglich bisher gegen CURRENT_DATE, das in der Session-Zeitzone (UTC)
-- ausgewertet wird und weder die lokale Zeitzone (Europe/Vienna) noch den
-- über Mitternacht laufenden Nachtdienst berücksichtigt - ein Zentralist
-- verlor dadurch schon kurz nach (UTC-)Mitternacht, mitten im eigenen
-- Nachtdienst, die per RLS gewährten Zentralisten-Rechte. Derselbe
-- Diensttag-Begriff wie neu in lib/zentraleShared.ts (operationalToday()):
-- vor 6 Uhr lokal gilt weiterhin der Vortag.
create or replace function public.operational_today()
returns date
language sql
stable
set search_path to ''
as $$
  select case
    when extract(hour from (now() at time zone 'Europe/Vienna')) < 6
      then ((now() at time zone 'Europe/Vienna')::date - 1)
    else (now() at time zone 'Europe/Vienna')::date
  end;
$$;

create or replace function public.is_zentralist_on_duty()
returns boolean
language sql
stable
set search_path to ''
as $function$
  SELECT EXISTS (
    SELECT 1 FROM public.duty_assignments d
    WHERE d.user_id=(SELECT auth.uid()) AND d.duty_date=public.operational_today() AND d.function IN ('zentrale','innendienst')
  );
$function$;
