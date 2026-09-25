create or replace function public.wipe_test_data()
returns table(tabelle text, geloescht bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_test_ids uuid[];
  v_n bigint;
  v_rec record;
  v_sql text;
  v_owner_cols text[] := array[
    'created_by','user_id','officer_id','beamter_id','requester_id','requested_by','actor_id',
    'author_id','responsible_user_id','akteneigentuemer_id'
  ];
  v_title_cols text[] := array[
    'title','name','titel','subject','bezeichnung','beschreibung','anlass','grund','label',
    'schluessel_nummer','nummer'
  ];
  v_conds text[];
  v_col text;
begin
  if not (
    public.has_role('admin')
    or session_user in ('service_role', 'postgres', 'supabase_admin')
  ) then
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

  for v_rec in
    select c.relname as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'profiles'
    order by c.relname
  loop
    v_conds := '{}';
    foreach v_col in array v_owner_cols loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_rec.tbl and column_name = v_col
      ) then
        v_conds := v_conds || format('%I = any($1)', v_col);
      end if;
    end loop;
    foreach v_col in array v_title_cols loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_rec.tbl and column_name = v_col
          and data_type in ('text','character varying','character')
      ) then
        v_conds := v_conds || format('%I like %L', v_col, '[TEST]%');
      end if;
    end loop;

    if coalesce(array_length(v_conds, 1), 0) = 0 then
      continue;
    end if;

    begin
      v_sql := format('delete from public.%I where %s', v_rec.tbl, array_to_string(v_conds, ' or '));
      execute v_sql using v_test_ids;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        insert into _wipe_report(tabelle, geloescht) values (v_rec.tbl, v_n);
      end if;
    exception when foreign_key_violation then
      null;
    when others then
      insert into _wipe_report(tabelle, geloescht)
      values (format('%s (SKIP: %s)', v_rec.tbl, sqlerrm), 0);
    end;
  end loop;

  for v_rec in
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
      execute format('update %s set %I = null where %I = any($1)', v_rec.tbl, v_rec.col, v_rec.col)
        using v_test_ids;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        insert into _wipe_report(tabelle, geloescht)
        values (format('%s.%s -> NULL', v_rec.tbl, v_rec.col), v_n);
      end if;
    exception when others then
      null;
    end;
  end loop;

  for v_rec in
    select c.relname as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'profiles'
    order by c.relname
  loop
    v_conds := '{}';
    foreach v_col in array v_owner_cols loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_rec.tbl and column_name = v_col
      ) then
        v_conds := v_conds || format('%I = any($1)', v_col);
      end if;
    end loop;
    if coalesce(array_length(v_conds, 1), 0) = 0 then
      continue;
    end if;
    begin
      execute format('delete from public.%I where %s', v_rec.tbl, array_to_string(v_conds, ' or '))
        using v_test_ids;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        insert into _wipe_report(tabelle, geloescht) values (v_rec.tbl || ' (pass2)', v_n);
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
    begin
      delete from public.profiles where id = any(v_test_ids);
      get diagnostics v_n = row_count;
      insert into _wipe_report(tabelle, geloescht)
      values ('profiles (auth.users NICHT gelöscht — manuell im Dashboard)', v_n);
    exception when foreign_key_violation then
      insert into _wipe_report(tabelle, geloescht)
      values ('profiles (FK-Blockade — Restfks manuell prüfen)', 0);
      raise;
    end;
  end;

  return query select r.tabelle, r.geloescht from _wipe_report r order by r.tabelle;
end;
$fn$;
