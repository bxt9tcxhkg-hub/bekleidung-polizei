-- "Stundenersatz" (Zeitausgleich statt Auszahlung, vgl. verguetung
-- 'stundenersatz' bei den Überstundenmeldungen) ist im Dienstplan bisher
-- keine eigene Kategorie - für die Eintragung im Planer-Grid (eigene Farbe,
-- ganztägig wie Urlaub/Krank/Karenz) braucht es aber eine eigene Kategorie
-- statt "sonstiges" (das bliebe sonst ein unspezifischer Auffangbecken-Wert).
alter table public.dienstplan_dienste drop constraint if exists dienstplan_dienste_kategorie_check;
alter table public.dienstplan_dienste add constraint dienstplan_dienste_kategorie_check
  check (kategorie in ('dienst', 'krank', 'urlaub', 'sonderurlaub', 'karenz', 'stundenersatz', 'sonstiges'));
