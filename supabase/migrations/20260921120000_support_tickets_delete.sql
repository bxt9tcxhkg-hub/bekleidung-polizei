-- Hilfe-Bereich: Zuständige (Admin/Bereichsbearbeiter) sollen einen ganzen
-- Support-Vorgang inkl. Chatverlauf löschen können, nicht nur einzelne
-- Nachrichten (siehe 20260921110000_support_messages_delete.sql). Bisher gab
-- es für support_tickets keine DELETE-Policy. support_messages.ticket_id hat
-- bereits ON DELETE CASCADE, die Nachrichten verschwinden also automatisch
-- mit.

DROP POLICY IF EXISTS "Bereichsbearbeiter löscht Ticket" ON public.support_tickets;
CREATE POLICY "Bereichsbearbeiter löscht Ticket" ON public.support_tickets
  FOR DELETE TO authenticated
  USING (public.can_manage_support_topic(topic));
