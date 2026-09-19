-- Manche Artikel sollen im Lager erfasst/nachbestellt werden können, aber
-- nie im Bekleidungskatalog (Shop) für Beamte auftauchen (z. B. rein
-- internes Verbrauchsmaterial).
alter table public.products
  add column orderable_in_shop boolean not null default true;
