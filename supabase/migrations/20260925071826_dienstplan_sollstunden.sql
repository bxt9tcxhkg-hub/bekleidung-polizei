-- Sollstunden des Monats (aus einer Textbox in der Excel-Vorlage, nicht aus
-- dem Zellenraster - siehe lib/dienstplanImport.ts::extrahiereSollstundenEintraege)
-- für "Meine Dienste": Gesamtstunden allein sagen nichts, ohne die Sollstunden
-- zum Vergleich zu kennen. Nullable, weil ältere/künftige Importe ohne
-- erkennbare Sollstunden-Textbox trotzdem funktionieren sollen.
alter table public.dienstplan_monate add column sollstunden integer check (sollstunden is null or sollstunden between 0 and 400);
