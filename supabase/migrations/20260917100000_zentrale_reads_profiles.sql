-- Kontakte-Register spiegelt automatisch alle aktiven Benutzer (Name,
-- Dienstnummer, Dienstgrad, Organisation). profiles war bisher nur für
-- Bekleidungs-Staff lesbar (Policy "Staff sieht alle Profile", has_role()
-- prüft profiles.roles). Zentrale-Personal ohne eigene Bekleidungs-Rolle
-- (z. B. reiner Zentrale-"user") hätte die Liste sonst leer gesehen -
-- zusätzliche, additive SELECT-Policy über has_portal_area_access('zentrale').
CREATE POLICY "Zentrale sieht Profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_portal_area_access('zentrale'));
