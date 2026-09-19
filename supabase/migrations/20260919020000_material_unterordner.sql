-- Beliebig viele Unterordner für Unterlagen (Einsatzmittel, Einsatztraining,
-- Schulungen teilen sich dieselbe Tabelle/Komponente, siehe
-- EinsatzMaterials.tsx) statt einer einzigen flachen Tab-Ebene.
alter table public.einsatz_material_tabs
  add column parent_id uuid references public.einsatz_material_tabs(id) on delete cascade,
  add constraint einsatz_material_tabs_not_own_parent check (parent_id is null or parent_id <> id);

create index einsatz_material_tabs_parent_idx on public.einsatz_material_tabs (parent_id);

-- Name muss nur innerhalb desselben Ordners eindeutig sein, nicht mehr
-- bereichsweit - derselbe Unterordnername (z. B. "2025") darf in mehreren
-- Ordnern vorkommen. coalesce mit einer Sentinel-UUID, weil NULL <> NULL in
-- einem Unique-Index sonst jede Kombination zuließe.
drop index if exists idx_einsatz_material_tabs_unique_active;
create unique index idx_einsatz_material_tabs_unique_active
  on public.einsatz_material_tabs (area, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)))
  where active;

-- Verhindert zyklische Verschachtelung (Ordner A -> B -> A), die jede
-- rekursive Abfrage/den Pfadaufbau im Client in eine Endlosschleife laufen
-- ließe. Reine Fremdschlüsselprüfung kann das nicht abdecken.
create or replace function public.check_einsatz_material_tab_no_cycle()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  current_id uuid;
  depth integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  current_id := new.parent_id;
  while current_id is not null loop
    if current_id = new.id then
      raise exception 'Ein Ordner darf nicht sein eigener (indirekter) Unterordner sein.';
    end if;
    depth := depth + 1;
    if depth > 100 then
      raise exception 'Ordnerstruktur zu tief verschachtelt.';
    end if;
    select parent_id into current_id from public.einsatz_material_tabs where id = current_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists einsatz_material_tabs_no_cycle on public.einsatz_material_tabs;
create trigger einsatz_material_tabs_no_cycle
  before insert or update of parent_id on public.einsatz_material_tabs
  for each row execute function public.check_einsatz_material_tab_no_cycle();
