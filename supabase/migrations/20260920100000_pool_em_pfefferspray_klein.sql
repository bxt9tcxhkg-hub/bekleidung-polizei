-- Neue Pool-Einsatzmittel-Kategorie: kleine Pfefferspray-Nachfüllkartusche
-- (neben dem bestehenden großen Pfefferspray). Erweitert die CHECK-
-- Constraints auf pool_einsatzmittel.category und
-- pool_einsatzmittel_requests.category um den neuen Wert
-- 'pfefferspray_klein'. Idempotent per DROP CONSTRAINT IF EXISTS.

ALTER TABLE public.pool_einsatzmittel
  DROP CONSTRAINT IF EXISTS pool_einsatzmittel_category_check;
ALTER TABLE public.pool_einsatzmittel
  ADD CONSTRAINT pool_einsatzmittel_category_check CHECK (category IN (
    'langwaffe_stg77',
    'magazine',
    'munition',
    'pfefferspray_gross',
    'pfefferspray_klein',
    'schild',
    'ballistischer_helm',
    'schwere_westen',
    'spuckschutzhaube'
  ));

ALTER TABLE public.pool_einsatzmittel_requests
  DROP CONSTRAINT IF EXISTS pool_einsatzmittel_requests_category_check;
ALTER TABLE public.pool_einsatzmittel_requests
  ADD CONSTRAINT pool_einsatzmittel_requests_category_check CHECK (category IN (
    'langwaffe_stg77',
    'magazine',
    'munition',
    'pfefferspray_gross',
    'pfefferspray_klein',
    'schild',
    'ballistischer_helm',
    'schwere_westen',
    'spuckschutzhaube'
  ));
