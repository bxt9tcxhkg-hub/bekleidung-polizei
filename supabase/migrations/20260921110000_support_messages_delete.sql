-- Hilfe-Bereich: Zuständige (Admin/Bereichsbearbeiter) sollen einzelne
-- Nachrichten in einem von ihnen verwalteten Support-Thread löschen können
-- (z. B. Fehleintrag/Spam entfernen). Bisher gab es für support_messages gar
-- keine DELETE-Policy, also war Löschen für niemanden möglich. Eigene
-- Nachrichten bleiben bewusst NICHT selbst löschbar - nur wer den
-- Themenbereich verwaltet (public.can_manage_support_topic(topic) über das
-- zugehörige Ticket).

DROP POLICY IF EXISTS "Bereichsbearbeiter löscht Nachricht" ON public.support_messages;
CREATE POLICY "Bereichsbearbeiter löscht Nachricht" ON public.support_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND public.can_manage_support_topic(t.topic)
    )
  );
