-- Eine Person hat immer Vor- und Nachnamen (nie nur einen kombinierten
-- Freitext-Namen), aber am Telefon ist oft zunächst nur einer von beiden
-- bekannt - daher beide Felder optional, mindestens eines muss gesetzt sein.
alter table public.operational_persons rename column name to nachname;
alter table public.operational_persons add column vorname text check (vorname is null or length(trim(vorname)) between 1 and 200);
alter table public.operational_persons alter column nachname drop not null;
alter table public.operational_persons drop constraint operational_persons_name_check;
alter table public.operational_persons add constraint operational_persons_nachname_check check (nachname is null or length(trim(nachname)) between 1 and 200);
alter table public.operational_persons add constraint operational_persons_vorname_or_nachname_check check (vorname is not null or nachname is not null);
drop index if exists public.operational_persons_name_idx;
create index operational_persons_nachname_idx on public.operational_persons (lower(nachname));
create index operational_persons_vorname_idx on public.operational_persons (lower(vorname));
