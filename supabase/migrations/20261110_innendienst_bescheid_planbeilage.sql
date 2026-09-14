-- Review-Finding: die Planbeilage (Luftbild+Kataster Marktplatz-Standplätze
-- a)/b)) wurde bisher jedem Bescheid Straßenmusik/-kunst unbedingt angehängt,
-- unabhängig davon, ob die eingetragenen Standplätze tatsächlich diese
-- Location betreffen. Jetzt ein explizites, je Bescheid gespeichertes Feld -
-- Vorgabe false, der/die Sachbearbeiter/in wählt bewusst aus.
ALTER TABLE public.innendienst_records ADD COLUMN planbeilage boolean NOT NULL DEFAULT false;
