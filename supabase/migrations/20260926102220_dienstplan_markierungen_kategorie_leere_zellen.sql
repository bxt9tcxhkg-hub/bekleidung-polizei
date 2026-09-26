-- Dienstplan-Planung: zwei Erweiterungen der Farbmarkierungen.
--
-- 1) Die bisher hart codierten Abwesenheitsfarben (Urlaub/Sonderurlaub/
--    Stundenersatz gelb, Krank grün, Karenz rosa - siehe die alte
--    absenzFarbe() in lib/dienstplanBesetzung.ts) werden jetzt als fixe
--    ("System"-)Einträge in derselben dienstplan_markierungen-Tabelle
--    geführt (kategorie gesetzt) - der Planer kann dort nur noch die
--    Farbe ändern, Name/Bedeutung bleiben fix (in der UI durchgesetzt).
--    Die Farbpalette wird dafür um gelb/gruen/rosa erweitert.
-- 2) Damit eine fehlende Markierung (z. B. ein bei einem Krankenstand
--    übersehenes Wochenende) auch nachträglich von Hand ergänzt werden
--    kann, darf eine Diensteintrag-Zeile jetzt auch OHNE Kürzel
--    (rohtext = '', kategorie = 'sonstiges') nur mit einer Markierung
--    gespeichert werden - rein visuell, zählt nirgends als Dienst oder
--    Abwesenheitstag (siehe lib/dienstplanSollstunden-Auswertung in
--    DienstplanPlanung.tsx, die kategorie 'sonstiges' nicht mitzählt).
alter table public.dienstplan_markierungen drop constraint dienstplan_markierungen_farbe_check;
alter table public.dienstplan_markierungen add constraint dienstplan_markierungen_farbe_check
  check (farbe in ('blau', 'lila', 'orange', 'tuerkis', 'grau', 'gelb', 'gruen', 'rosa'));

alter table public.dienstplan_markierungen add column kategorie text
  check (kategorie is null or kategorie in ('urlaub', 'krank', 'sonderurlaub', 'karenz', 'stundenersatz'));
create unique index dienstplan_markierungen_kategorie_key on public.dienstplan_markierungen (kategorie) where kategorie is not null;

insert into public.dienstplan_markierungen (name, farbe, kategorie, reihenfolge)
select v.name, v.farbe, v.kategorie, v.reihenfolge
from (values
  ('Urlaub', 'gelb', 'urlaub', 0),
  ('Sonderurlaub', 'gelb', 'sonderurlaub', 1),
  ('Stundenersatz', 'gelb', 'stundenersatz', 2),
  ('Krank', 'gruen', 'krank', 3),
  ('Karenz', 'rosa', 'karenz', 4)
) as v(name, farbe, kategorie, reihenfolge)
where not exists (select 1 from public.dienstplan_markierungen m where m.kategorie = v.kategorie);
