-- Wer per RLS bereits mail_deliveries (RSa/RSb) anlegen darf (jede Rolle mit
-- Zentrale-Zugriff, nicht nur Sachbearbeiter/Admin - z. B. Rolle 'user'),
-- muss dafür auch eine noch nicht erfasste Person anlegen können, sonst
-- schlägt der bestehende Ablauf für diese Nutzer fehl. Ändern/Löschen einer
-- Person bleibt bei can_manage_zentrale() (Sachbearbeiter/Admin/Genehmiger).
drop policy "Personen anlegen" on public.operational_persons;
create policy "Personen anlegen" on public.operational_persons for insert
  with check (public.has_portal_area_access('zentrale') and created_by = (select auth.uid()));
