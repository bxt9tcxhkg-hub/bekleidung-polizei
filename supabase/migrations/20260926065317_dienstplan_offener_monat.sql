-- Der Genehmiger soll explizit festlegen können, für welchen Monat Beamte
-- aktuell Freiplanungswünsche einreichen dürfen (statt dass jeder Monat bis
-- zur automatisch berechneten Wunschfrist offen bleibt), sowie welcher
-- Monat aktuell "der laufende Dienstplan" ist (Standard-Monat, den
-- Dienstplan-Planung/Dienststellenkalender/Meine Dienste beim Öffnen
-- anzeigen - freie Navigation zu anderen Monaten bleibt dort möglich).
alter table public.dienstplan_regeln add column offener_wunsch_monat date;
alter table public.dienstplan_regeln add column aktueller_planungsmonat date;
alter table public.dienstplan_regeln add constraint dienstplan_regeln_offener_wunsch_monat_check
  check (offener_wunsch_monat is null or extract(day from offener_wunsch_monat) = 1);
alter table public.dienstplan_regeln add constraint dienstplan_regeln_aktueller_planungsmonat_check
  check (aktueller_planungsmonat is null or extract(day from aktueller_planungsmonat) = 1);

-- dienstplan_wunsch_setzen/-loeschen: zusätzlich zur bestehenden
-- Fristprüfung muss p_monat jetzt exakt dem vom Genehmiger freigegebenen
-- offener_wunsch_monat entsprechen - Beamte können also nicht mehr für
-- einen beliebigen zukünftigen Monat Wünsche einreichen.
create or replace function public.dienstplan_wunsch_setzen(p_monat date, p_datum date, p_wunsch text, p_notiz text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_frist_tage integer;
  v_offener_monat date;
begin
  if extract(day from p_monat) <> 1 then
    raise exception 'p_monat muss der erste Tag eines Monats sein.';
  end if;
  if p_datum < p_monat or p_datum >= (p_monat + interval '1 month')::date then
    raise exception 'p_datum muss im angegebenen Monat liegen.';
  end if;

  select wunschfrist_tage, offener_wunsch_monat into v_frist_tage, v_offener_monat from public.dienstplan_regeln where id = 1;
  if v_offener_monat is null or p_monat <> v_offener_monat then
    raise exception 'Für diesen Monat sind aktuell keine Dienstwünsche möglich.';
  end if;
  if current_date > (p_monat - (coalesce(v_frist_tage, 14) || ' days')::interval)::date then
    raise exception 'Die Frist für Dienstwünsche in diesem Monat ist abgelaufen.';
  end if;

  insert into public.dienstplan_wuensche (beamter_id, monat, datum, wunsch, notiz)
  values (auth.uid(), p_monat, p_datum, p_wunsch, nullif(p_notiz, ''))
  on conflict (beamter_id, datum, wunsch) do update set notiz = excluded.notiz, monat = excluded.monat;
end;
$$;

create or replace function public.dienstplan_wunsch_loeschen(p_monat date, p_datum date, p_wunsch text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_frist_tage integer;
  v_offener_monat date;
begin
  select wunschfrist_tage, offener_wunsch_monat into v_frist_tage, v_offener_monat from public.dienstplan_regeln where id = 1;
  if v_offener_monat is null or p_monat <> v_offener_monat then
    raise exception 'Für diesen Monat sind aktuell keine Dienstwünsche möglich.';
  end if;
  if current_date > (p_monat - (coalesce(v_frist_tage, 14) || ' days')::interval)::date then
    raise exception 'Die Frist für Dienstwünsche in diesem Monat ist abgelaufen.';
  end if;

  delete from public.dienstplan_wuensche where beamter_id = auth.uid() and datum = p_datum and wunsch = p_wunsch;
end;
$$;
