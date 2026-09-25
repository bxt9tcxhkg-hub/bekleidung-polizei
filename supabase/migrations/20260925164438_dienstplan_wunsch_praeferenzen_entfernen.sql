-- Dienstwünsche: "Tagdienst bevorzugt"/"Nachtdienst bevorzugt" laut
-- Kommandant wieder entfernt - es bleiben die drei konkreten,
-- kontingentierten Freiplanungswünsche (frei_tag, frei_nacht, urlaub).
delete from public.dienstplan_wuensche where wunsch in ('tagdienst_bevorzugt', 'nachtdienst_bevorzugt');

alter table public.dienstplan_wuensche drop constraint if exists dienstplan_wuensche_wunsch_check;
alter table public.dienstplan_wuensche add constraint dienstplan_wuensche_wunsch_check
  check (wunsch in ('frei_tag', 'frei_nacht', 'urlaub'));
