-- Abdeckende Indizes für die neuen Institutionen-Fremdschlüssel.
create index zentrale_kontakt_institutionen_created_by_idx
  on public.zentrale_kontakt_institutionen (created_by)
  where created_by is not null;

create index zentrale_kontakte_institution_idx
  on public.zentrale_kontakte (institution)
  where institution is not null;
