-- Einsatzmittel & Training: mehrere gleichzeitige Bereichsrollen erlauben.
-- Die bestehende Rollen-Whitelist und die Nicht-leer-Prüfung bleiben aktiv.

ALTER TABLE public.portal_area_roles
  DROP CONSTRAINT IF EXISTS portal_area_roles_einsatz_single;
