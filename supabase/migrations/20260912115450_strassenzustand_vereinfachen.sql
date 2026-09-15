-- Straßenzustand vereinfachen: nur noch 3 Zustände (Frei befahrbar / Gesperrt /
-- Sonstige mit Freitext) statt der bisherigen fünf; Zeitraum kann Datum oder
-- Datum+Uhrzeit sein (timestamptz statt date). Keine Produktivdaten betroffen
-- (Tabellen waren zum Zeitpunkt dieser Migration leer).

ALTER TABLE public.strassenzustand_berichtzeilen DROP CONSTRAINT strassenzustand_berichtzeilen_zustand_check;
ALTER TABLE public.strassenzustand_berichtzeilen ADD CONSTRAINT strassenzustand_berichtzeilen_zustand_check
  CHECK (zustand IN ('frei_befahrbar','gesperrt','sonstige'));

ALTER TABLE public.strassenzustand_berichtzeilen ALTER COLUMN gueltig_von DROP DEFAULT;
ALTER TABLE public.strassenzustand_berichtzeilen ALTER COLUMN gueltig_von TYPE timestamptz USING gueltig_von::timestamptz;
ALTER TABLE public.strassenzustand_berichtzeilen ALTER COLUMN gueltig_von SET DEFAULT now();
ALTER TABLE public.strassenzustand_berichtzeilen ALTER COLUMN gueltig_bis TYPE timestamptz USING gueltig_bis::timestamptz;

CREATE OR REPLACE FUNCTION public.strassenzustand_compute_meldungsart() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  prev_zustand text;
BEGIN
  SELECT z.zustand INTO prev_zustand
  FROM public.strassenzustand_berichtzeilen z
  WHERE (NEW.strasse_id IS NOT NULL AND z.strasse_id = NEW.strasse_id)
     OR (NEW.strasse_id IS NULL AND z.strasse_id IS NULL AND lower(trim(z.strasse_freitext)) = lower(trim(NEW.strasse_freitext)))
  ORDER BY z.created_at DESC
  LIMIT 1;

  IF NEW.zustand = 'frei_befahrbar' THEN
    NEW.meldungsart := 'widerruf';
  ELSIF prev_zustand IS NULL OR prev_zustand = 'frei_befahrbar' THEN
    NEW.meldungsart := 'neuzugang';
  ELSE
    NEW.meldungsart := 'aenderung';
  END IF;
  RETURN NEW;
END;
$$;
