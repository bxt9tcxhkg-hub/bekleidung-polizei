-- Reaktion auf ein Review-Finding (P2): ZentralePersonen.save() (und der
-- inline "Person anlegen"-Zweig von PersonPicker) schreiben beim Erfassen/
-- Bearbeiten einer Person auch die verknüpfte Telefonnummer in
-- operational_phone_numbers - diese Tabelle war beim Öffnen des
-- Personen-/Objekte-Registers für diensthabende Zentralisten (siehe
-- 20261117_zentrale_on_duty_operative_write_access.sql) nicht mitbedacht
-- worden und blieb bei can_manage_zentrale() allein. Der Personen-Schreibvorgang
-- selbst gelang dadurch, das Speichern der Telefonnummer schlug aber schlug
-- still fehl (der Fehler wird im UI nicht separat behandelt). Löschen wird
-- hier bewusst mit erweitert (anders als beim übergeordneten Personen-
-- Register): das Löschen einer einzelnen Telefonnummer ist Teil des
-- gewöhnlichen Bearbeiten-Ablaufs (Nummer im Formular leeren), keine
-- eigenständige "endgültig löschen"-Aktion wie beim Personen-Datensatz.
DROP POLICY "Telefonnummern anlegen" ON public.operational_phone_numbers;
CREATE POLICY "Telefonnummern anlegen" ON public.operational_phone_numbers FOR INSERT TO authenticated
  WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND created_by = (SELECT auth.uid()));
DROP POLICY "Telefonnummern ändern" ON public.operational_phone_numbers;
CREATE POLICY "Telefonnummern ändern" ON public.operational_phone_numbers FOR UPDATE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
DROP POLICY "Telefonnummern löschen" ON public.operational_phone_numbers;
CREATE POLICY "Telefonnummern löschen" ON public.operational_phone_numbers FOR DELETE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
