-- Dritter Anlauf: das eigene Flag schutzfaelle.kontrolle_erforderlich (aus
-- 20260918240000) konnte gegenüber dem tatsächlichen Kontrollauftrag
-- auseinanderlaufen - löscht der Genehmiger den Kontrollauftrag ganz normal
-- auf der Kontrollaufträge-Seite, blieb das Flag unverändert auf true stehen
-- ("ich kann die Aufträge löschen, aber es hat keine Auswirkung auf den
-- Schutzfall"). Einzige verlässliche Wahrheit ist, ob ein verknüpfter
-- Kontrollauftrag (zentrale_entries.schutzfall_id) existiert oder nicht -
-- das eigene Flag ist damit überflüssig und wird entfernt. Die Checkbox in
-- ZentraleAvBv.tsx liest/schreibt ab jetzt direkt diesen Ist-Zustand.
alter table public.schutzfaelle drop column if exists kontrolle_erforderlich;
