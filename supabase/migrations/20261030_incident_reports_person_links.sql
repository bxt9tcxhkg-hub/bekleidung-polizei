-- Melder und beteiligte Person werden über das gemeinsame Personen-Register
-- verknüpft (echte Verknüpfung statt Namens-/Geburtsdatum-Freitext), damit
-- Meldungen und alle personenbezogenen Register (AV/BV & EV, Fahndungen,
-- Personenhinweise, RSa/RSb) verlässlich auf dieselbe Person verweisen.
-- Die bisherigen Freitextfelder bleiben für abwärtskompatible Anzeige
-- erhalten, werden aber beim Speichern aus der verknüpften Person abgeleitet.
alter table public.incident_reports add column caller_person_id uuid references public.operational_persons(id) on delete set null;
alter table public.incident_reports add column involved_person_id uuid references public.operational_persons(id) on delete set null;
create index incident_reports_caller_person_id_idx on public.incident_reports (caller_person_id);
create index incident_reports_involved_person_id_idx on public.incident_reports (involved_person_id);
