-- Diensthabende(r) Innendienst soll dieselben operativen Rechte in der
-- Zentrale bekommen wie ein diensthabender Zentralist (is_zentralist_on_duty()) -
-- in der Praxis deckt an ruhigeren Tagen dieselbe Person beide Posten ab.
-- is_zentralist_on_duty() ist die einzige Quelle für diese Berechtigung
-- (RLS-Policies auf operational_persons/objects/phone_numbers, den sechs
-- zentrale_*-Kategorietabellen, strassenzustand_berichte/-zeilen und
-- incident_reports rufen alle ausschließlich diese eine Funktion auf), daher
-- genügt eine einzige Änderung hier, um alle diese Stellen konsistent zu
-- erweitern. Name bleibt bewusst unverändert (an vielen Stellen referenziert) -
-- deckt jetzt aber "Zentrale ODER Innendienst" ab, nicht mehr nur "Zentrale".
CREATE OR REPLACE FUNCTION public.is_zentralist_on_duty() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.duty_assignments d
    WHERE d.user_id=(SELECT auth.uid()) AND d.duty_date=CURRENT_DATE AND d.function IN ('zentrale','innendienst')
  );
$$;
