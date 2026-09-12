-- Optionale Adresse/Ort bei Personenhinweisen, damit ein Hinweis auch beim
-- Eintippen des Einsatzorts gefunden wird (nicht nur über Name/Telefon der
-- beteiligten Person) - der Zentralist kennt beim Ersttelefonat oft nur die
-- Adresse, noch keinen Namen.
ALTER TABLE public.operational_person_notes ADD COLUMN location text;

COMMENT ON COLUMN public.operational_person_notes.location IS 'Optionale Adresse/Ort, damit der Hinweis auch beim Eintippen des Einsatzorts gefunden wird (nicht nur über Name/Telefon der beteiligten Person).';
