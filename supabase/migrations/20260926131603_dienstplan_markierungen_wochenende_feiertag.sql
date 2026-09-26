-- Die bisher hart codierte Wochenende/Feiertag-Hervorhebung (amber, siehe
-- DienstplanPlanung.tsx/dienstplanDruckPdf.ts) wird jetzt als sechste
-- System-Markierung in derselben dienstplan_markierungen-Tabelle geführt
-- (kategorie = 'wochenende_feiertag') - der Planer kann die Farbe unter
-- Dienstplan-Einstellungen ändern, wie schon bei den fünf
-- Abwesenheitskategorien (siehe Migration
-- 20260926102220_dienstplan_markierungen_kategorie_leere_zellen.sql).
-- Anders als diese ist 'wochenende_feiertag' keine gültige
-- dienstplan_dienste.kategorie (Wochenende/Feiertag ist eine
-- Tageseigenschaft, keine Diensteintrag-Kategorie).
alter table public.dienstplan_markierungen drop constraint dienstplan_markierungen_kategorie_check;
alter table public.dienstplan_markierungen add constraint dienstplan_markierungen_kategorie_check
  check (kategorie is null or kategorie in ('urlaub', 'krank', 'sonderurlaub', 'karenz', 'stundenersatz', 'wochenende_feiertag'));

insert into public.dienstplan_markierungen (name, farbe, kategorie, reihenfolge)
select 'Wochenende/Feiertag', 'orange', 'wochenende_feiertag', 5
where not exists (select 1 from public.dienstplan_markierungen m where m.kategorie = 'wochenende_feiertag');
