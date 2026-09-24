-- Fachlicher Abschluss Straßenmusik/Straßenkunst:
-- höchstens zwei Bescheide pro Tag, verpflichtende Planbeilage,
-- Ein-Klick-Widerruf aus dem Außendienst und eine personenbezogene
-- Entscheidung des Kommandanten für künftige Ausstellungen.

update public.innendienst_records
set planbeilage = true
where kind in ('bescheid_strassenmusik', 'bescheid_strassenkunst');

alter table public.innendienst_records
  alter column planbeilage set default true,
  add constraint innendienst_bescheid_planbeilage_pflicht
    check (kind = 'verstoss' or planbeilage);

create or replace function public.limit_innendienst_bescheide_pro_tag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind not in ('bescheid_strassenmusik', 'bescheid_strassenkunst') then
    return new;
  end if;

  -- Gleicher Schlüssel je Ausstellungsdatum: auch parallele Erfassungen
  -- können die Tagesgrenze nicht überschreiten.
  perform pg_advisory_xact_lock(hashtextextended('innendienst-bescheide:' || new.issued_date::text, 0));

  if (
    select count(*)
    from public.innendienst_records r
    where r.issued_date = new.issued_date
      and r.kind in ('bescheid_strassenmusik', 'bescheid_strassenkunst')
      and r.id <> new.id
  ) >= 2 then
    raise exception using
      errcode = 'P0001',
      message = 'Pro Tag dürfen höchstens zwei Bescheide ausgestellt werden.';
  end if;

  return new;
end;
$$;

create trigger innendienst_bescheide_tagesgrenze
  before insert or update of issued_date, kind on public.innendienst_records
  for each row execute function public.limit_innendienst_bescheide_pro_tag();

create table public.innendienst_person_entscheidungen (
  person_id uuid primary key references public.operational_persons(id) on delete cascade,
  status text not null check (status in ('erlaubt', 'ruecksprache', 'gesperrt')),
  entschieden_von uuid not null references public.profiles(id) on delete restrict,
  entschieden_am timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger innendienst_person_entscheidungen_updated_at
  before update on public.innendienst_person_entscheidungen
  for each row execute function public.update_updated_at();

alter table public.innendienst_person_entscheidungen enable row level security;
revoke all on table public.innendienst_person_entscheidungen from public, anon, authenticated;
grant select, insert, update on table public.innendienst_person_entscheidungen to authenticated;

create policy "Bescheidentscheidungen lesen"
  on public.innendienst_person_entscheidungen for select to authenticated
  using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());

create policy "Bescheidentscheidungen anlegen"
  on public.innendienst_person_entscheidungen for insert to authenticated
  with check (public.is_genehmiger() and entschieden_von = (select auth.uid()));

create policy "Bescheidentscheidungen ändern"
  on public.innendienst_person_entscheidungen for update to authenticated
  using (public.is_genehmiger())
  with check (public.is_genehmiger() and entschieden_von = (select auth.uid()));

-- Innendienst-Tagesfunktion darf Bescheide erfassen. Außendienst erhält
-- keinen allgemeinen Schreibzugriff auf das Protokoll, sondern nur die
-- eng gefasste Aktion unten.
alter policy "Innendienst-Protokoll anlegen" on public.innendienst_records
  with check (
    (public.can_manage_zentrale() or public.is_zentralist_on_duty())
    and created_by = (select auth.uid())
  );

create or replace function public.verstoss_gegen_bescheid_feststellen(p_bescheid_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bescheid public.innendienst_records%rowtype;
  v_verstoss_id uuid;
begin
  if auth.uid() is null or not public.is_operative_duty_today() then
    raise exception 'Keine Berechtigung';
  end if;

  select * into v_bescheid
  from public.innendienst_records
  where id = p_bescheid_id
  for update;

  if not found
     or v_bescheid.kind not in ('bescheid_strassenmusik', 'bescheid_strassenkunst')
     or v_bescheid.issued_date <> public.operational_today() then
    raise exception 'Der heutige Bescheid wurde nicht gefunden.';
  end if;

  select id into v_verstoss_id
  from public.innendienst_records
  where kind = 'verstoss' and related_bescheid_id = p_bescheid_id
  limit 1;

  if v_verstoss_id is not null then
    return v_verstoss_id;
  end if;

  insert into public.innendienst_records (
    kind, subject, status, related_bescheid_id, person_id, issued_date,
    planbeilage, created_by
  ) values (
    'verstoss', 'Verstoß gegen die Auflagen – Bescheid zurückgezogen',
    'erledigt', p_bescheid_id, v_bescheid.person_id,
    v_bescheid.issued_date, false, auth.uid()
  ) returning id into v_verstoss_id;

  return v_verstoss_id;
end;
$$;

revoke all on function public.verstoss_gegen_bescheid_feststellen(uuid) from public, anon;
grant execute on function public.verstoss_gegen_bescheid_feststellen(uuid) to authenticated;

create unique index innendienst_verstoss_je_bescheid_idx
  on public.innendienst_records(related_bescheid_id)
  where kind = 'verstoss';
