-- Sachbearbeiter kann pro Produkt festlegen, ob es über die Massa bezogen
-- wird oder eigenbeschafft werden muss, und ob es Größen, eine
-- Universalgröße oder gar keine Größenangabe hat.
alter table public.products
  add column bezugsart text not null default 'massa',
  add column size_mode text not null default 'sizes';

alter table public.products
  add constraint products_bezugsart_check check (bezugsart in ('massa', 'eigenbeschaffung')),
  add constraint products_size_mode_check check (size_mode in ('sizes', 'universal', 'none'));

-- Bestehende Produkte ohne definierte Größe (bisher implizit "keine Größe
-- nötig") auf den neuen, expliziten Modus ummünzen.
update public.products set size_mode = 'none' where sizes = '{}';
