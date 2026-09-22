alter table public.ereignisse
  add column betroffene_anzahl integer check (betroffene_anzahl is null or betroffene_anzahl >= 0),
  add column opfer_anzahl integer check (opfer_anzahl is null or opfer_anzahl >= 0),
  add column sachschaden text,
  add column erforderliche_massnahmen text,
  add column ereignisgrund text,
  add column oeffentliche_sicherheit_beeintraechtigt boolean,
  add column koordinierung_noetig boolean,
  add column updated_by uuid references public.profiles(id);

create index ereignisse_updated_by_idx on public.ereignisse(updated_by);
