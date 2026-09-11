-- Kassen-Abrechnung als echte Hilfeleistung: erwarteten Erlös laut Kasse erfassen,
-- dann die Bargeld-Stückelungen zählen. Grundbestand (Wechselgeld) ist fix 500 €.
-- Differenz wird im Client berechnet und als Momentaufnahme mitgespeichert.

ALTER TABLE public.innendienst_shift_tasks
  ADD COLUMN float_amount numeric NOT NULL DEFAULT 500 CHECK (float_amount >= 0),
  ADD COLUMN expected_revenue numeric CHECK (expected_revenue IS NULL OR expected_revenue >= 0),
  ADD COLUMN cash_denominations jsonb,
  ADD COLUMN counted_total numeric CHECK (counted_total IS NULL OR counted_total >= 0);

COMMENT ON COLUMN public.innendienst_shift_tasks.float_amount IS 'Fixer Kassen-Grundbestand (Wechselgeld) zu Schichtbeginn, Standard 500 €.';
COMMENT ON COLUMN public.innendienst_shift_tasks.expected_revenue IS 'Vom Bediensteten von der Kasse abgelesener erwarteter Erlös der Schicht.';
COMMENT ON COLUMN public.innendienst_shift_tasks.cash_denominations IS 'Gezählte Stückelungen als {"<Cent-Wert>": Anzahl}, z. B. {"5000":2,"500":3}.';
COMMENT ON COLUMN public.innendienst_shift_tasks.counted_total IS 'Aus cash_denominations berechnete Gesamtsumme zum Zeitpunkt der Bestätigung.';
