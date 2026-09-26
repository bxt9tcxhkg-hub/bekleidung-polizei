-- Dienstplan-Planung im Portal: neben den bestehenden Freiplanungswünschen
-- (frei_tag/frei_nacht/urlaub, kontingentiert) können Beamte jetzt auch
-- dienstliche Termine hinterlegen, die der Planer bei der Einteilung
-- berücksichtigen soll, ihn aber NICHT binden: Gerichtsverhandlung, ein
-- Termin der Schulverkehrserziehung, eine Sitzung der Personalvertretung.
-- Diese drei Typen zählen laut Kommandant NICHT gegen das monatliche
-- Freiplanungskontingent und nicht in die "max. 6 am Stück"-Regel (rein
-- clientseitig durchgesetzt, siehe lib/dienstplanWunsch.ts - deshalb hier
-- keine serverseitige Änderung an dieser Logik nötig). Optional kann dazu
-- eine Uhrzeit (von/bis) angegeben werden.
alter table public.dienstplan_wuensche add column von_zeit time;
alter table public.dienstplan_wuensche add column bis_zeit time;

alter table public.dienstplan_wuensche drop constraint if exists dienstplan_wuensche_wunsch_check;
alter table public.dienstplan_wuensche add constraint dienstplan_wuensche_wunsch_check
  check (wunsch in ('frei_tag', 'frei_nacht', 'urlaub', 'gerichtsverhandlung', 'schulverkehrserziehung', 'personalvertretung'));

create or replace function public.dienstplan_wunsch_setzen(p_monat date, p_datum date, p_wunsch text, p_notiz text default null, p_von_zeit text default null, p_bis_zeit text default null)
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

  insert into public.dienstplan_wuensche (beamter_id, monat, datum, wunsch, notiz, von_zeit, bis_zeit)
  values (auth.uid(), p_monat, p_datum, p_wunsch, nullif(p_notiz, ''), nullif(p_von_zeit, '')::time, nullif(p_bis_zeit, '')::time)
  on conflict (beamter_id, datum, wunsch) do update set notiz = excluded.notiz, monat = excluded.monat, von_zeit = excluded.von_zeit, bis_zeit = excluded.bis_zeit;
end;
$$;

-- create or replace mit geänderter Parameterliste erzeugt eine zusätzliche
-- Überladung statt die bestehende Funktion zu ersetzen - die alte
-- 4-Parameter-Signatur (ohne von_zeit/bis_zeit) explizit entfernen, damit
-- nur noch eine Version existiert.
drop function if exists public.dienstplan_wunsch_setzen(date, date, text, text);
