create index ereignisse_created_by_idx on public.ereignisse(created_by);
create index ereignis_einsaetze_linked_by_idx on public.ereignis_einsaetze(linked_by);
create index ereignis_verlauf_changed_by_idx on public.ereignis_verlauf(changed_by);
create index ereignis_verstaendigungen_updated_by_idx on public.ereignis_verstaendigungen(updated_by);
