-- Dienstplan-Planung im Portal, Korrektur nach Rückmeldung des Kommandanten:
-- Freiplanungswünsche sind konkreter geregelt, als Phase 2 ursprünglich
-- abgebildet hat:
--   - Ein ganzer freier Tag braucht ZWEI Wünsche (Tag frei + Nacht frei),
--     daher jetzt eigene Typen 'frei_tag'/'frei_nacht' statt einem
--     einzigen 'frei' - und pro Person/Tag können jetzt MEHRERE
--     Wunsch-Zeilen nebeneinander stehen (bisher nur eine).
--   - 'urlaub' ist ein eigener Typ: blockiert den ganzen Tag, kostet aber
--     nur 1 Kontingenteinheit statt 2.
--   - Monatliches Kontingent (18 bei Vollzeit) und die Regel "max. 6
--     Tag/Nacht-Slots am Stück" werden rein clientseitig berechnet (siehe
--     lib/dienstplanWunsch.ts) - Dienstwünsche binden den Planer ohnehin
--     nicht, daher hier bewusst keine serverseitige Durchsetzung dieser
--     beiden Regeln (die Einreichfrist bleibt serverseitig geprüft).
--   - Beschäftigungsgrad wird künftig auf der hausinternen Skala geführt,
--     auf der 111 Vollzeit ist (nicht 100) - betrifft die Sollstunden-
--     Formel (lib/dienstplanSollstunden.ts) UND das
--     Freiplanungswunsch-Kontingent gleichermaßen.

-- Der bisherige generische 'frei'-Typ ist durch frei_tag/frei_nacht ersetzt -
-- das Feature ist gerade erst live gegangen, es gibt keine echten
-- Bestandsdaten, die hier fachlich sauber migriert werden müssten.
delete from public.dienstplan_wuensche where wunsch = 'frei';

alter table public.dienstplan_wuensche drop constraint if exists dienstplan_wuensche_wunsch_check;
alter table public.dienstplan_wuensche add constraint dienstplan_wuensche_wunsch_check
  check (wunsch in ('frei_tag', 'frei_nacht', 'urlaub', 'tagdienst_bevorzugt', 'nachtdienst_bevorzugt'));

-- Mehrere Wunsch-Zeilen pro Person/Tag erlauben (z. B. frei_tag UND
-- frei_nacht für einen ganzen freien Tag), aber weiterhin nicht denselben
-- Wunsch-Typ doppelt für denselben Tag.
alter table public.dienstplan_wuensche drop constraint if exists dienstplan_wuensche_beamter_id_datum_key;
alter table public.dienstplan_wuensche add constraint dienstplan_wuensche_beamter_id_datum_wunsch_key unique (beamter_id, datum, wunsch);

alter table public.dienstplan_person_einstellungen drop constraint if exists dienstplan_person_einstellungen_beschaeftigungsgrad_check;
alter table public.dienstplan_person_einstellungen add constraint dienstplan_person_einstellungen_beschaeftigungsgrad_check
  check (beschaeftigungsgrad > 0 and beschaeftigungsgrad <= 111);
alter table public.dienstplan_person_einstellungen alter column beschaeftigungsgrad set default 111;

-- dienstplan_wunsch_setzen: Konfliktziel jetzt (beamter_id, datum, wunsch)
-- statt (beamter_id, datum) - der Wunsch-Typ ist Teil des Schlüssels, ein
-- erneutes Setzen desselben Typs am selben Tag aktualisiert nur die Notiz.
create or replace function public.dienstplan_wunsch_setzen(p_monat date, p_datum date, p_wunsch text, p_notiz text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_frist_tage integer;
begin
  if extract(day from p_monat) <> 1 then
    raise exception 'p_monat muss der erste Tag eines Monats sein.';
  end if;
  if p_datum < p_monat or p_datum >= (p_monat + interval '1 month')::date then
    raise exception 'p_datum muss im angegebenen Monat liegen.';
  end if;

  select wunschfrist_tage into v_frist_tage from public.dienstplan_regeln where id = 1;
  if current_date > (p_monat - (coalesce(v_frist_tage, 14) || ' days')::interval)::date then
    raise exception 'Die Frist für Dienstwünsche in diesem Monat ist abgelaufen.';
  end if;

  insert into public.dienstplan_wuensche (beamter_id, monat, datum, wunsch, notiz)
  values (auth.uid(), p_monat, p_datum, p_wunsch, nullif(p_notiz, ''))
  on conflict (beamter_id, datum, wunsch) do update set notiz = excluded.notiz, monat = excluded.monat;
end;
$$;

-- dienstplan_wunsch_loeschen: löscht jetzt nur noch den angegebenen
-- Wunsch-Typ an diesem Tag (nicht mehr alle Wünsche des Tages) - alte
-- Signatur (ohne p_wunsch) wird entfernt, da mehrere Zeilen pro Tag jetzt
-- möglich sind.
drop function if exists public.dienstplan_wunsch_loeschen(date, date);

create or replace function public.dienstplan_wunsch_loeschen(p_monat date, p_datum date, p_wunsch text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_frist_tage integer;
begin
  select wunschfrist_tage into v_frist_tage from public.dienstplan_regeln where id = 1;
  if current_date > (p_monat - (coalesce(v_frist_tage, 14) || ' days')::interval)::date then
    raise exception 'Die Frist für Dienstwünsche in diesem Monat ist abgelaufen.';
  end if;

  delete from public.dienstplan_wuensche where beamter_id = auth.uid() and datum = p_datum and wunsch = p_wunsch;
end;
$$;

revoke all on function public.dienstplan_wunsch_loeschen(date, date, text) from public, anon;
grant execute on function public.dienstplan_wunsch_loeschen(date, date, text) to authenticated;
