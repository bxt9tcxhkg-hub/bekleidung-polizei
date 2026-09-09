-- Admin ist eine portalweite, übergeordnete Rolle und führt keinen Polizeidienstgrad.
alter table public.profiles
  drop constraint if exists profiles_dienstgrad_check;

alter table public.profiles
  add constraint profiles_dienstgrad_check
  check (
    dienstgrad is null
    or (
      organisation = 'Stadtpolizei'
      and not ('admin' = any (roles))
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
  'Selbst gewählter Polizeidienstgrad ausschließlich für Stadtpolizei-Bedienstete ohne übergeordnete Admin-Rolle.';
