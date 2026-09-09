-- Polizeidienstgrad im eigenen Profil; nur für die Organisation Stadtpolizei.
alter table public.profiles
  add column if not exists dienstgrad text;

alter table public.profiles
  drop constraint if exists profiles_dienstgrad_check;

alter table public.profiles
  add constraint profiles_dienstgrad_check
  check (
    dienstgrad is null
    or (
      organisation = 'Stadtpolizei'
      and dienstgrad = any (
        array[
          'Aspirant',
          'Inspektor',
          'Revierinspektor',
          'Gruppeninspektor',
          'Bezirksinspektor',
          'Abteilungsinspektor',
          'Kontrollinspektor',
          'Chefinspektor'
        ]::text[]
      )
    )
  );

comment on column public.profiles.dienstgrad is
  'Selbst gewählter Polizeidienstgrad für Angehörige der Organisation Stadtpolizei; maximal Chefinspektor.';
