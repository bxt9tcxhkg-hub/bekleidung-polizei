
create or replace function public.preserve_schutzfall_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by = old.created_by;
  return new;
end;
$$;

create trigger schutzfaelle_preserve_created_by
before update on public.schutzfaelle
for each row execute function public.preserve_schutzfall_created_by();

revoke execute on function public.enforce_schutzbereich_rules() from public, anon, authenticated;
revoke execute on function public.touch_schutz_updated_at() from public, anon, authenticated;
revoke execute on function public.preserve_schutzfall_created_by() from public, anon, authenticated;

