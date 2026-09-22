-- Testdaten-Kennzeichnung + Wipe (eine DB, kein Supabase-Branching).
-- Konvention: siehe docs/TESTDATEN.md

alter table public.profiles
  add column if not exists is_test boolean not null default false;

comment on column public.profiles.is_test is
  'Kennzeichnet Test-/Demo-Accounts. wipe_test_data() löscht abhängige Fachdaten und den Account. Nie bei echten Bediensteten setzen.';

create index if not exists idx_profiles_is_test
  on public.profiles (is_test)
  where is_test;

create or replace function public.wipe_test_data()
returns table(tabelle text, geloescht bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_test_ids uuid[];
  v_n bigint;
  v_fk record;
  v_tbl text;
  v_owners text[];
  v_titles text[];
  v_col text;
  v_conds text[];
  v_sql text;
begin
  if not (public.has_role('admin') or session_user = 'service_role') then
    raise exception 'wipe_test_data: nicht autorisiert (nur Admin oder Service-Role)'
      using errcode = '42501';
  end if;

  create temporary table if not exists _wipe_report (tabelle text, geloescht bigint)
    on commit drop;
  delete from _wipe_report;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_test_ids
  from public.profiles where is_test = true;

  if coalesce(array_length(v_test_ids, 1), 0) = 0 then
    return query select r.tabelle, r.geloescht from _wipe_report r;
    return;
  end if;

  for v_tbl, v_owners, v_titles in
    select * from (values
      ('audit_log', array['user_id','actor_id'], null::text[]),
      ('duty_assignments', array['user_id'], null),
      ('einsatz_materials', array['created_by'], array['title','name']),
      ('einsatz_material_tabs', array['created_by'], array['name','title']),
      ('einsatz_namensliste', array['created_by'], null),
      ('einsatz_parteien', array['created_by'], null),
      ('einsatz_training_assignments', array['officer_id','created_by'], null),
      ('einsatz_training_attendance', array['officer_id'], null),
      ('einsatz_training_completions', array['officer_id'], null),
      ('einsatz_training_registrations', array['officer_id'], null),
      ('einsatz_training_participations', array['officer_id'], null),
      ('einsatz_training_sessions', array['created_by'], array['name','title']),
      ('einsatz_training_modules', array['created_by'], array['name','title']),
      ('fleet_appointments', array['created_by'], array['subject','title','name']),
      ('fleet_care_tasks', array['created_by'], array['subject','title','name']),
      ('fleet_check_items', array['created_by'], array['name']),
      ('fleet_equipment_items', array['created_by'], array['name']),
      ('fleet_vehicles', array['created_by'], array['name','label']),
      ('grundausstattung', array['created_by','user_id'], null),
      ('innendienst_records', array['created_by'], array['subject','title']),
      ('innendienst_shift_tasks', array['user_id'], null),
      ('innendienst_gebuehrenpositionen', array['created_by'], array['name']),
      ('innendienst_gebuehrensaetze', array['created_by'], array['name']),
      ('mail_deliveries', array['created_by'], null),
      ('operational_person_notes', array['created_by'], null),
      ('operational_phone_numbers', array['created_by'], null),
      ('operational_persons', array['created_by'], array['name','nachname']),
      ('operational_objects', array['created_by'], array['label','name']),
      ('orders', array['user_id'], null),
      ('personal_einsatzmittel', array['officer_id','user_id'], null),
      ('personal_einsatzmittel_requests', array['requester_id','created_by'], null),
      ('pool_einsatzmittel', array['created_by'], array['name']),
      ('pool_einsatzmittel_requests', array['requested_by','created_by'], null),
      ('portal_area_roles', array['user_id'], null),
      ('products', array['created_by'], array['name']),
      ('quarters', array['created_by'], array['name']),
      ('schulungen_assignments', array['officer_id'], null),
      ('schulungen_completions', array['officer_id'], null),
      ('schulungen_registrations', array['officer_id'], null),
      ('schulungen_sessions', array['created_by'], array['name','title']),
      ('schulungen_module', array['created_by'], array['name']),
      ('schutzkontrollen', array['created_by'], null),
      ('schutzfaelle', array['created_by'], array['title','name']),
      ('shoe_refund_caps', array['created_by'], null),
      ('shoe_refunds', array['user_id'], null),
      ('stock_orders', array['requested_by','created_by'], null),
      ('support_tickets', array['user_id','created_by'], array['subject','title']),
      ('ueberstunden_meldungen', array['beamter_id','user_id'], null),
      ('user_budgets', array['user_id'], null),
      ('wichtige_telefonnummern', array['created_by'], array['bezeichnung','name']),
      ('zentrale_entries', array['created_by'], array['title','name']),
      ('incident_reports', array['created_by'], array['title','name']),
      ('deliveries', array['created_by','user_id'], array['name']),
      ('strassenzustand_berichte', array['created_by','bearbeiter'], array['nummer']),
      ('strassenzustand_auftraggeber', array['created_by'], array['name']),
      ('strassenzustand_melder', array['created_by'], array['name']),
      ('strassenzustand_strassen', array['created_by'], array['name'])
    ) as t(tbl, owners, titles)
  loop
    if to_regclass('public.' || v_tbl) is null then
      continue;
    end if;
    v_conds := '{}';
    if v_owners is not null then
      foreach v_col in array v_owners loop
        if exists (
          select 1 from information_schema.columns
          where table_schema='public' and table_name=v_tbl and column_name=v_col
        ) then
          v_conds := v_conds || format('%I = any($1)', v_col);
        end if;
      end loop;
    end if;
    if v_titles is not null then
      foreach v_col in array v_titles loop
        if exists (
          select 1 from information_schema.columns
          where table_schema='public' and table_name=v_tbl and column_name=v_col
        ) then
          v_conds := v_conds || format('%I like %L', v_col, '[TEST]%');
        end if;
      end loop;
    end if;
    if coalesce(array_length(v_conds,1),0) = 0 then
      continue;
    end if;
    v_sql := format('delete from public.%I where %s', v_tbl, array_to_string(v_conds, ' or '));
    execute v_sql using v_test_ids;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into _wipe_report(tabelle, geloescht) values (v_tbl, v_n);
    end if;
  end loop;

  -- Nullable FKs auf profiles → NULL
  for v_fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join lateral unnest(c.conkey) with ordinality as ck(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = ck.attnum
    join pg_class ref on ref.oid = c.confrelid
    join pg_namespace rn on rn.oid = ref.relnamespace and rn.nspname = 'public'
    where c.contype = 'f'
      and ref.relname = 'profiles'
      and cl.relname <> 'profiles'
      and not a.attnotnull
  loop
    begin
      execute format('update %s set %I = null where %I = any($1)', v_fk.tbl, v_fk.col, v_fk.col)
        using v_test_ids;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        insert into _wipe_report(tabelle, geloescht)
        values (format('%s.%s -> NULL', v_fk.tbl, v_fk.col), v_n);
      end if;
    exception when others then
      null;
    end;
  end loop;

  begin
    delete from auth.users where id = any(v_test_ids);
    get diagnostics v_n = row_count;
    insert into _wipe_report(tabelle, geloescht) values ('auth.users (+ profiles cascade)', v_n);
  exception when others then
    delete from public.profiles where id = any(v_test_ids);
    get diagnostics v_n = row_count;
    insert into _wipe_report(tabelle, geloescht)
    values ('profiles (auth.users NICHT gelöscht — manuell im Dashboard)', v_n);
  end;

  return query select r.tabelle, r.geloescht from _wipe_report r order by r.tabelle;
end;
$fn$;

revoke all on function public.wipe_test_data() from public;
grant execute on function public.wipe_test_data() to authenticated, service_role;

comment on function public.wipe_test_data() is
  'Löscht is_test-Profile und abhängige/[TEST]-Fachdaten. Aufruf: select * from wipe_test_data(); siehe docs/TESTDATEN.md.';
