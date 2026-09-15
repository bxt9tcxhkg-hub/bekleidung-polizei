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
