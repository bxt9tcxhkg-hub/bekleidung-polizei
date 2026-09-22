-- Fahndungen bleiben bis zur fachlichen Konkretisierung aus dem aktuellen Einsatzkontext herausgenommen.
create or replace function public.incident_context(p_incident_id uuid)
returns table(
  kind text,
  severity text,
  title text,
  detail text,
  distance_m integer
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_inc public.incident_reports%rowtype;
  v_radius integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not (public.has_portal_area_access('zentrale') or public.is_operative_duty_today()) then
    raise exception 'Keine operative Berechtigung';
  end if;

  select * into v_inc from public.incident_reports where id=p_incident_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;

  select coalesce(nearby_radius_m,0) into v_radius
  from public.incident_reason_configs where code=v_inc.reason_code and active;

  -- Aktive Hinweise zu konkret beteiligten Personen.
  return query
  with personen as (
    select v_inc.involved_person_id as id where v_inc.involved_person_id is not null
    union
    select ep.person_id from public.einsatz_parteien ep where ep.incident_id=p_incident_id
  )
  select
    'personenhinweis'::text,
    case
      when n.category in ('aggressiv','waffenverbot','suizidgefahr') then 'sicherheit'
      when n.category in ('fluchtgefahr','infektionsschutz') then 'achtung'
      else 'operativ'
    end,
    ('Personenhinweis: ' || case n.category
      when 'aggressiv' then 'Aggressionshinweis'
      when 'waffenverbot' then 'Waffenverbot'
      when 'fluchtgefahr' then 'Fluchtgefahr'
      when 'suizidgefahr' then 'Suizidgefahr'
      when 'infektionsschutz' then 'Infektionsschutz'
      else 'Hinweis' end)::text,
    (n.note ||
      case when nullif(trim(n.action_guidance),'') is not null
        then ' · Vorgehen: ' || n.action_guidance
        else ''
      end)::text,
    null::integer
  from public.operational_person_notes n
  join personen p on p.id=n.person_id
  where n.active
    and (n.valid_until is null or n.valid_until >= current_date);

  -- Schutzfall mit direktem Bezug zu einer beteiligten Person.
  return query
  with personen as (
    select v_inc.involved_person_id as id where v_inc.involved_person_id is not null
    union
    select ep.person_id from public.einsatz_parteien ep where ep.incident_id=p_incident_id
  ),
  faelle as (
    select distinct s.*
    from public.schutzfaelle s
    where s.status='aktiv' and s.ende >= now()
      and (
        s.gefaehrder_id in (select id from personen)
        or exists (
          select 1 from public.schutzfall_personen sp
          where sp.schutzfall_id=s.id and sp.person_id in (select id from personen)
        )
      )
  )
  select
    'schutzfall_person'::text,
    'sicherheit'::text,
    ((case when s.massnahme='bv_av' then 'Betretungs- und Annäherungsverbot' else 'Einstweilige Verfügung' end) ||
      ' · direkter Personenbezug' ||
      case when s.waffenverbot then ' · Waffenverbot' else '' end)::text,
    (
      'gültig bis ' || to_char(s.ende at time zone 'Europe/Vienna','DD.MM.YYYY HH24:MI') ||
      coalesce(' · Ausnahmen: ' || nullif(trim(s.ausnahmen),''),'') ||
      coalesce(' · Hinweis: ' || nullif(trim(s.hinweise),''),'') ||
      ' · PAD ' || s.pad_aktenzahl
    )::text,
    null::integer
  from faelle s;

  -- Exakter Objektbezug über strukturierte Einsatzadresse.
  return query
  with objekte as (
    select o.*
    from public.operational_objects o
    where nullif(trim(v_inc.location_street),'') is not null
      and lower(trim(coalesce(o.strasse,''))) = lower(trim(v_inc.location_street))
      and lower(trim(coalesce(o.hausnummer,''))) = lower(trim(coalesce(v_inc.location_house_number,'')))
  )
  select
    'objekt'::text,
    'operativ'::text,
    ('Objektinformation · ' || coalesce(o.label,o.address))::text,
    o.note::text,
    null::integer
  from objekte o
  where nullif(trim(o.note),'') is not null;

  return query
  with objekte as (
    select o.id
    from public.operational_objects o
    where nullif(trim(v_inc.location_street),'') is not null
      and lower(trim(coalesce(o.strasse,''))) = lower(trim(v_inc.location_street))
      and lower(trim(coalesce(o.hausnummer,''))) = lower(trim(coalesce(v_inc.location_house_number,'')))
  )
  select
    'schluessel'::text,
    'operativ'::text,
    'Schlüssel zum Einsatzobjekt vorhanden'::text,
    ('Schlüssel ' || k.schluessel_nummer || coalesce(' · ' || k.verwahrort,''))::text,
    null::integer
  from public.zentrale_schluessel k
  where k.object_id in (select id from objekte)
    and k.status='vorhanden';

  -- Schutzfall mit exaktem Einsatzobjekt.
  return query
  with objekte as (
    select o.id
    from public.operational_objects o
    where nullif(trim(v_inc.location_street),'') is not null
      and lower(trim(coalesce(o.strasse,''))) = lower(trim(v_inc.location_street))
      and lower(trim(coalesce(o.hausnummer,''))) = lower(trim(coalesce(v_inc.location_house_number,'')))
  )
  select
    'schutzfall_objekt'::text,
    'sicherheit'::text,
    ((case when s.massnahme='bv_av' then 'Betretungs- und Annäherungsverbot' else 'Einstweilige Verfügung' end) ||
      ' · direkt am Einsatzobjekt' ||
      case when s.waffenverbot then ' · Waffenverbot' else '' end)::text,
    (
      b.bezeichnung || ' · Schutzradius ' || b.radius_m || ' m' ||
      ' · gültig bis ' || to_char(s.ende at time zone 'Europe/Vienna','DD.MM.YYYY HH24:MI') ||
      coalesce(' · Ausnahmen: ' || nullif(trim(s.ausnahmen),''),'') ||
      coalesce(' · Hinweis: ' || nullif(trim(s.hinweise),''),'') ||
      ' · PAD ' || s.pad_aktenzahl
    )::text,
    0::integer
  from public.schutzbereiche b
  join public.schutzfaelle s on s.id=b.schutzfall_id
  where b.object_id in (select id from objekte)
    and s.status='aktiv' and s.ende >= now();

  -- Nur bei dafür konfigurierten Einsatzgründen: aktive Schutzbereiche im
  -- Nahbereich. Der Treffer wird ausdrücklich als räumlicher, nicht sicherer
  -- Zusammenhang gekennzeichnet.
  if v_radius > 0 and v_inc.location_lat is not null and v_inc.location_lng is not null then
    return query
    with dist as (
      select b.*, s.pad_aktenzahl, s.massnahme, s.ende, s.waffenverbot, s.ausnahmen,
        round(6371000 * 2 * asin(sqrt(
          power(sin(radians(b.lat - v_inc.location_lat)/2),2) +
          cos(radians(v_inc.location_lat))*cos(radians(b.lat))*
          power(sin(radians(b.lng - v_inc.location_lng)/2),2)
        )))::integer as d
      from public.schutzbereiche b
      join public.schutzfaelle s on s.id=b.schutzfall_id
      where s.status='aktiv' and s.ende >= now() and b.position_bestaetigt
    )
    select
      'schutzfall_nahbereich'::text,
      'nahbereich'::text,
      ((case when d.massnahme='bv_av' then 'Betretungs- und Annäherungsverbot' else 'Einstweilige Verfügung' end) ||
        ' im Nahbereich · ' || d.bezeichnung ||
        case when d.waffenverbot then ' · Waffenverbot' else '' end)::text,
      (
        'Schutzradius ' || d.radius_m || ' m' ||
        ' · gültig bis ' || to_char(d.ende at time zone 'Europe/Vienna','DD.MM.YYYY HH24:MI') ||
        coalesce(' · Ausnahmen: ' || nullif(trim(d.ausnahmen),''),'') ||
        ' · PAD ' || d.pad_aktenzahl ||
        ' · räumlicher Hinweis, Zusammenhang zum Einsatz nicht bestätigt'
      )::text,
      d.d::integer
    from dist d
    where d.d <= v_radius
    order by d.d;
  end if;
end;
$$;

revoke all on function public.incident_context(uuid) from public, anon;
grant execute on function public.incident_context(uuid) to authenticated;

comment on function public.incident_context(uuid) is
  'Liefert ausschließlich konkrete aktive Einsatzkontexte; Nahbereich nur nach Einsatzgrund-Konfiguration.';
