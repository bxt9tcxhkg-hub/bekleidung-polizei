-- verbot/fahndung/schluessel/kontakt/alarmierung/unterlage haben jetzt eigene
-- Tabellen (siehe zentrale_register_category_tables) und werden hier nicht
-- mehr angelegt. lage/kontrollauftrag/uebergabe/brief bleiben unverändert
-- generisch. Tabelle war zum Zeitpunkt der Migration leer.
alter table public.zentrale_entries drop constraint zentrale_entries_category_check;
alter table public.zentrale_entries add constraint zentrale_entries_category_check
  check (category = any (array['lage','kontrollauftrag','uebergabe','brief']));
