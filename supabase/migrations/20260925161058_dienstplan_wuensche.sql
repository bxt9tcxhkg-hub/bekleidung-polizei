-- Dienstplan-Planung im Portal, Phase 2: Dienstwünsche der Beamten. Jede/r
-- aktive Bedienstete trägt für einen Monat pro Tag höchstens einen Wunsch
-- ein (frei/bevorzugt Tag-/Nachtdienst) - der Planer sieht das beim Planen,
-- ist aber nicht daran gebunden (siehe Dienststellenkalender/Planer-Grid,
-- Phase 3). Nur bis zur konfigurierten Wunschfrist
-- (dienstplan_regeln.wunschfrist_tage) vor Monatsbeginn änderbar - der
-- Deadline-Check hängt vom jeweiligen Monat ab und kann daher nicht per
-- RLS allein abgebildet werden, deshalb in den RPCs.
create table public.dienstplan_wuensche (
  id uuid primary key default gen_random_uuid(),
  beamter_id uuid not null references public.profiles(id) on delete cascade,
  monat date not null check (extract(day from monat) = 1),
  datum date not null,
  wunsch text not null check (wunsch in ('frei', 'tagdienst_bevorzugt', 'nachtdienst_bevorzugt')),
  notiz text check (notiz is null or length(notiz) <= 300),
  erstellt_at timestamptz not null default now(),
  unique (beamter_id, datum)
);
create index dienstplan_wuensche_monat_idx on public.dienstplan_wuensche (monat);

alter table public.dienstplan_wuensche enable row level security;
revoke all on public.dienstplan_wuensche from anon, authenticated;
grant select on public.dienstplan_wuensche to authenticated;

create policy "Dienstplan-Wuensche lesen" on public.dienstplan_wuensche
for select to authenticated using (
  beamter_id = (select auth.uid()) or public.has_role('admin') or public.has_role('genehmiger')
);

-- Schreiben ausschließlich über die beiden RPCs (SECURITY DEFINER) - kein
-- direkter Insert/Update/Delete-Grant, analog zu dienstplan_dienste.
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
  on conflict (beamter_id, datum) do update set wunsch = excluded.wunsch, notiz = excluded.notiz, monat = excluded.monat;
end;
$$;

create or replace function public.dienstplan_wunsch_loeschen(p_monat date, p_datum date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_frist_tage integer;
begin
  select wunschfrist_tage into v_frist_tage from public.dienstplan_regeln where id = 1;
  if current_date > (p_monat - (coalesce(v_frist_tage, 14) || ' days')::interval)::date then
    raise exception 'Die Frist für Dienstwünsche in diesem Monat ist abgelaufen.';
  end if;

  delete from public.dienstplan_wuensche where beamter_id = auth.uid() and datum = p_datum;
end;
$$;

revoke all on function public.dienstplan_wunsch_setzen(date, date, text, text) from public, anon;
grant execute on function public.dienstplan_wunsch_setzen(date, date, text, text) to authenticated;
revoke all on function public.dienstplan_wunsch_loeschen(date, date) from public, anon;
grant execute on function public.dienstplan_wunsch_loeschen(date, date) to authenticated;
