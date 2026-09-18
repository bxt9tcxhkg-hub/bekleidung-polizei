-- Die Checkbox "Kontrolle durch die Streife erforderlich" aus
-- 20260918230000 wurde nirgends gespeichert - beim erneuten Öffnen zum
-- Bearbeiten war sie immer fest auf true gesetzt, ein Wegklicken hatte also
-- nie einen sichtbaren/dauerhaften Effekt. Jetzt echte Spalte auf
-- schutzfaelle, plus ein Gegenstück zum bestehenden create-RPC, damit ein
-- nachträgliches Wegklicken den zuvor angelegten Kontrollauftrag auch
-- wieder entfernen kann (dieselbe Berechtigung wie beim Anlegen des
-- Schutzfalls selbst, nicht die sonst für Kontrollaufträge nötige
-- Genehmiger-Berechtigung - konsequent zum bestehenden create-RPC).
alter table public.schutzfaelle add column kontrolle_erforderlich boolean not null default true;

create or replace function public.remove_schutzfall_kontrollauftrag(p_schutzfall_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_manage_zentrale() or public.is_zentralist_on_duty()) then
    raise exception 'Keine Berechtigung';
  end if;
  delete from public.zentrale_entries where schutzfall_id = p_schutzfall_id;
end;
$$;
revoke all on function public.remove_schutzfall_kontrollauftrag(uuid) from public, anon;
grant execute on function public.remove_schutzfall_kontrollauftrag(uuid) to authenticated;
