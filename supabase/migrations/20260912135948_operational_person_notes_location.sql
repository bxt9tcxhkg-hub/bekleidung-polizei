alter table public.operational_person_notes
  add column location text;

comment on column public.operational_person_notes.location is 'Optionale Adresse/Ort, damit der Hinweis auch beim Eintippen des Einsatzorts gefunden wird (nicht nur über Name/Telefon der beteiligten Person).';
