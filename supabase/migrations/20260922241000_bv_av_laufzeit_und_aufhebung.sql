-- BV/AV: regulär zwei Wochen ab Anordnung; vorzeitige Aufhebung
-- durch die Sicherheitsbehörde wird als eigener Vorgang dokumentiert.

alter table public.schutzfaelle
  add column if not exists aufgehoben_am timestamptz,
  add column if not exists aufgehoben_durch text
    check (aufgehoben_durch is null or length(btrim(aufgehoben_durch)) between 2 and 200),
  add column if not exists aufhebungsgrund text
    check (aufhebungsgrund is null or length(btrim(aufhebungsgrund)) between 2 and 1000);

create or replace function public.enforce_bv_av_laufzeit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.massnahme = 'bv_av' then
    -- Das reguläre Ende wird nicht manuell gepflegt: zwei Wochen ab Anordnung.
    new.ende := new.beginn + interval '14 days';

    if new.status = 'aufgehoben' then
      if new.aufgehoben_am is null then
        new.aufgehoben_am := now();
      end if;
      if new.aufgehoben_durch is null then
        new.aufgehoben_durch := 'Sicherheitsbehörde';
      end if;
    else
      new.aufgehoben_am := null;
      new.aufgehoben_durch := null;
      new.aufhebungsgrund := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists schutzfaelle_enforce_bv_av_laufzeit on public.schutzfaelle;
create trigger schutzfaelle_enforce_bv_av_laufzeit
before insert or update on public.schutzfaelle
for each row execute function public.enforce_bv_av_laufzeit();

revoke execute on function public.enforce_bv_av_laufzeit() from public, anon, authenticated;

-- Bestehende aktive BV/AV auf das reguläre Ende zwei Wochen nach Ausspruch korrigieren.
update public.schutzfaelle
set ende = beginn + interval '14 days'
where massnahme = 'bv_av'
  and status <> 'aufgehoben';
