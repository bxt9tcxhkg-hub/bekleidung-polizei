-- Performance-Nachtrag für die operative Fahrzeugvorauswahl.
create index if not exists duty_vehicle_defaults_vehicle_id_idx
  on public.duty_vehicle_defaults(vehicle_id);
