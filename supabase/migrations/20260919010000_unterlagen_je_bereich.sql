-- "Kontrollbehelfe" im Außendienst verlinkte bisher direkt auf die
-- Zentrale-Seite /zentrale/unterlagen (dieselbe Tabelle, keine eigene
-- Kopie) - fachlich falsch: Unterlagen der Zentrale und Kontrollbehelfe des
-- Außendienstes sind unterschiedliche Inhalte für unterschiedliche Bereiche,
-- nur zufällig hat es sich dieselbe Seite geteilt. Gleiches Muster bei
-- Innendienst -> /zentrale/unterlagen.
--
-- Statt drei fast identischer Tabellen bekommt zentrale_unterlagen eine
-- bereich-Spalte: alle drei operativen Bereiche (Zentrale, Außendienst,
-- Innendienst) laufen ohnehin unter derselben Portal-Berechtigung
-- has_portal_area_access('zentrale')/can_manage_zentrale() (siehe
-- ZentraleShell.tsx/AussendienstShell.tsx/InnendienstShell.tsx - alle drei
-- durch denselben hasAreaAccess('zentrale')-Guard geschützt), nur die
-- Inhalte sollen pro Bereich getrennt angezeigt werden. Bestehende
-- Einträge waren bisher ausschließlich über die Zentrale-Seite gepflegt und
-- bleiben daher als 'zentrale' zugeordnet.
alter table public.zentrale_unterlagen
  add column bereich text not null default 'zentrale' check (bereich in ('zentrale', 'aussendienst', 'innendienst'));

create index zentrale_unterlagen_bereich_idx on public.zentrale_unterlagen (bereich);
