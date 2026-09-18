-- Rückbau von 20260918193000_schutzfall_kontrollauftrag.sql: automatisches
-- Erzeugen eines Kontrollauftrags aus einem Schutzfall war nicht gewünscht -
-- weder rückwirkend für bereits angelegte Schutzfälle (die durch das bloße
-- Bearbeiten/Öffnen unerwünscht einen Kontrollauftrag bekommen haben, weil
-- save() beim Editieren alle Schutzbereiche löscht und neu einfügt, was den
-- Trigger erneut auslöste) noch als laufende Automatik. Ob eine Kontrolle
-- nötig ist, soll nicht implizit beim Anlegen von BV/AV & EV mitentschieden
-- werden.

drop trigger if exists schutzbereiche_ensure_kontrollauftrag on public.schutzbereiche;
drop function if exists public.schutzbereich_ensure_kontrollauftrag();

-- Bereits automatisch erzeugte Kontrollaufträge entfernen.
delete from public.zentrale_entries where schutzfall_id is not null;

alter table public.zentrale_entries drop column if exists schutzfall_id;
