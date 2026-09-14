-- Bescheid-PDF Straßenmusik/Straßenkunst: die bestehenden Bescheid-Einträge
-- (innendienst_records, kind='bescheid_strassenmusik'/'bescheid_strassenkunst')
-- bekommen die zusätzlichen Felder, die die offizielle Bescheid-Vorlage für
-- den PDF-Export braucht (siehe lib/innendienstBescheidPdf.ts). Auflagen,
-- Begründung und Rechtsmittelbelehrung bleiben feste, im PDF-Generator
-- hinterlegte Textvorlage je kind (identisch mit der offiziellen Vorlage) -
-- hier werden nur die tatsächlich variablen Angaben gespeichert. Die
-- Kostenaufstellung wird bewusst NICHT als Betrag gespeichert, sondern über
-- gebuehrensatz_id live aus der Gebührenordnung nachgeschlagen (siehe
-- 20261005_innendienst_gebuehrenordnung.sql) - so bleibt das PDF auch nach
-- einer Gebührenänderung korrekt.
ALTER TABLE public.innendienst_records
  ADD COLUMN standplaetze jsonb,
  ADD COLUMN zeit_von time,
  ADD COLUMN zeit_bis time,
  ADD COLUMN gebuehrensatz_id uuid REFERENCES public.innendienst_gebuehrensaetze(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.innendienst_records.standplaetze IS 'Nur bei Bescheiden: zugewiesene Standplätze (a), b), ... in der Vorlage) als JSON-Array von Freitext-Zeilen.';
COMMENT ON COLUMN public.innendienst_records.zeit_von IS 'Nur bei Bescheiden mit Zeitfenster (z. B. Straßenkunst) - bei Straßenmusik ungenutzt, dort ist die Zeit fest in der Textvorlage hinterlegt.';
COMMENT ON COLUMN public.innendienst_records.gebuehrensatz_id IS 'Nur bei Bescheiden: verweist auf den Gebührensatz, dessen Positionen die Kostenaufstellung im PDF bilden - live nachgeschlagen, kein gespeicherter Betrag.';

-- Analog zu related_bescheid_id (siehe 20260911120000): diese Felder sind
-- ausschließlich für Bescheide gedacht, bei 'verstoss' müssen sie leer bleiben.
ALTER TABLE public.innendienst_records
  ADD CONSTRAINT innendienst_records_verstoss_hat_keine_bescheid_felder
  CHECK (kind <> 'verstoss' OR (standplaetze IS NULL AND zeit_von IS NULL AND zeit_bis IS NULL AND gebuehrensatz_id IS NULL));
