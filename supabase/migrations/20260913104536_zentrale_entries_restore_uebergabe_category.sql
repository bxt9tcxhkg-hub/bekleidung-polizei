-- Korrektur der letzten Migration: uebergabe wird von Innendienst weiterhin
-- als eigener, manuell gepflegter Übergabepunkt genutzt (eigener Tab,
-- unabhängig von Einsätzen) - nur die Zentrale-Seite braucht dafür keine
-- manuellen Einträge mehr (dort ergibt sich die Übergabe aus offenen
-- Einsatzmeldungen).
alter table public.zentrale_entries drop constraint zentrale_entries_category_check;
alter table public.zentrale_entries add constraint zentrale_entries_category_check
  check (category = any (array['lage','kontrollauftrag','uebergabe','brief']));
