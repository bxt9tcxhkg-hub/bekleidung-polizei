-- "Überstunden" soll eine System-Markierung sein (fixer Name, Farbe vom
-- Planer änderbar unter Dienstplan-Einstellungen), keine frei definierte -
-- der Planer hatte sie versehentlich als persönliche Markierung angelegt.
-- Anders als die Abwesenheitskategorien (Urlaub/Krank/...) und
-- 'wochenende_feiertag' sitzt 'ueberstunden' auf einem ECHTEN Diensteintrag
-- (kategorie 'dienst') als Zusatzinfo über markierung_id - keine eigene
-- dienstplan_dienste.kategorie.
alter table public.dienstplan_markierungen drop constraint dienstplan_markierungen_kategorie_check;
alter table public.dienstplan_markierungen add constraint dienstplan_markierungen_kategorie_check
  check (kategorie is null or kategorie in ('urlaub', 'krank', 'sonderurlaub', 'karenz', 'stundenersatz', 'wochenende_feiertag', 'ueberstunden'));

-- Eine bereits vom Planer angelegte persönliche "Überstunden"-Markierung
-- wird zur System-Markierung aufgewertet (id bleibt erhalten, damit
-- bestehende dienstplan_dienste.markierung_id-Verweise gültig bleiben) -
-- nur falls noch keine System-Markierung mit dieser Kategorie existiert.
update public.dienstplan_markierungen
set kategorie = 'ueberstunden', reihenfolge = 6
where kategorie is null and lower(name) = 'überstunden'
  and not exists (select 1 from public.dienstplan_markierungen m where m.kategorie = 'ueberstunden');

insert into public.dienstplan_markierungen (name, farbe, kategorie, reihenfolge)
select 'Überstunden', 'blau', 'ueberstunden', 6
where not exists (select 1 from public.dienstplan_markierungen m where m.kategorie = 'ueberstunden');
