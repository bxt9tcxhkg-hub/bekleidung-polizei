-- Bugfix: eine rein farblich markierte, sonst leere Zelle (kategorie
-- 'sonstiges', kein Dienst-Kürzel - siehe
-- 20260926102220_dienstplan_markierungen_kategorie_leere_zellen.sql)
-- konnte nicht gespeichert werden, weil dienstplan_dienste_rohtext_check
-- IMMER mindestens 1 Zeichen verlangte. Für kategorie 'sonstiges' darf
-- rohtext jetzt leer sein - alle anderen Kategorien (dienst/krank/urlaub/...)
-- brauchen weiterhin ein echtes Kürzel.
alter table public.dienstplan_dienste drop constraint dienstplan_dienste_rohtext_check;
alter table public.dienstplan_dienste add constraint dienstplan_dienste_rohtext_check
  check (
    length(trim(rohtext)) <= 200
    and (kategorie = 'sonstiges' or length(trim(rohtext)) >= 1)
  );
