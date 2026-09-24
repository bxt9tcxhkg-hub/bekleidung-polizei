-- Bestehende, nicht näher bezeichnete Nummern bleiben unverändert in telefon.
-- Ihre Zuordnung zu Büro/Dienst/Privat erfolgt erst durch die Datenpflege.
alter table public.zentrale_kontakte
  add column telefon_buero text check (telefon_buero is null or length(telefon_buero) <= 50),
  add column telefon_diensthandy text check (telefon_diensthandy is null or length(telefon_diensthandy) <= 50),
  add column telefon_privathandy text check (telefon_privathandy is null or length(telefon_privathandy) <= 50);
