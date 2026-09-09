-- Hilfevorgänge werden einem Portalbereich zugeordnet.
-- Sachbearbeiter sehen und bearbeiten nur Vorgänge ihrer eigenen Bereiche;
-- globale Administratoren behalten Zugriff auf alle Bereiche.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'help',
  ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT 'general';

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_kind_valid,
  ADD CONSTRAINT support_tickets_kind_valid
    CHECK (kind IN ('help', 'improvement', 'idea')),
  DROP CONSTRAINT IF EXISTS support_tickets_topic_valid,
  ADD CONSTRAINT support_tickets_topic_valid
    CHECK (topic IN (
      'general', 'bekleidung', 'einsatz_mt', 'zentrale', 'innendienst',
      'aussendienst', 'schulungen', 'fuhrpark', 'ueberstunden'
    ));

-- Frühere UI-Versionen haben Art und Bereich als Präfix im Betreff gespeichert.
UPDATE public.support_tickets
SET kind = CASE
  WHEN subject LIKE '[Verbesserung] %' THEN 'improvement'
  WHEN subject LIKE '[Idee] %' THEN 'idea'
  ELSE kind
END;

UPDATE public.support_tickets
SET subject = regexp_replace(subject, '^\[(Verbesserung|Idee)\] ', '');

UPDATE public.support_tickets
SET topic = CASE
  WHEN subject LIKE '[Bekleidung] %' THEN 'bekleidung'
  WHEN subject LIKE '[Einsatzmittel & Training] %' THEN 'einsatz_mt'
  WHEN subject LIKE '[Zentrale] %' THEN 'zentrale'
  WHEN subject LIKE '[Innendienst] %' THEN 'innendienst'
  WHEN subject LIKE '[Außendienst] %' THEN 'aussendienst'
  WHEN subject LIKE '[Schulungen] %' THEN 'schulungen'
  WHEN subject LIKE '[Fuhrpark] %' THEN 'fuhrpark'
  WHEN subject LIKE '[Überstunden] %' THEN 'ueberstunden'
  ELSE topic
END;

UPDATE public.support_tickets
SET subject = regexp_replace(
  subject,
  '^\[(Bekleidung|Einsatzmittel & Training|Zentrale|Innendienst|Außendienst|Schulungen|Fuhrpark|Überstunden)\] ',
  ''
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_topic_status_last_message
  ON public.support_tickets (topic, status, last_message_at DESC);

CREATE OR REPLACE FUNCTION public.can_manage_support_topic(p_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('admin')
    OR (
      p_topic = 'bekleidung'
      AND (
        public.has_portal_area_role('bekleidung', 'sachbearbeiter')
        OR public.has_portal_area_role('bekleidung', 'admin')
      )
    )
    OR (
      p_topic = 'einsatz_mt'
      AND (
        public.has_portal_area_role('einsatz_mt', 'sachbearbeiter')
        OR public.has_portal_area_role('einsatz_mt', 'admin')
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_support_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_support_topic(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_support_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ticket_owner uuid;
  ticket_topic text;
BEGIN
  NEW.body := trim(NEW.body);
  IF NEW.body = '' THEN
    RAISE EXCEPTION 'Nachricht darf nicht leer sein';
  END IF;
  IF char_length(NEW.body) > 4000 THEN
    RAISE EXCEPTION 'Nachricht ist zu lang';
  END IF;

  SELECT user_id, topic INTO ticket_owner, ticket_topic
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF ticket_owner IS NULL THEN
    RAISE EXCEPTION 'Ticket nicht gefunden';
  END IF;

  NEW.from_admin := public.can_manage_support_topic(ticket_topic)
    AND ticket_owner IS DISTINCT FROM NEW.author_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_support_ticket_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.user_id := OLD.user_id;
  NEW.subject := OLD.subject;
  NEW.kind := OLD.kind;
  NEW.topic := OLD.topic;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Eigenes Ticket oder Admin liest" ON public.support_tickets;
DROP POLICY IF EXISTS "Eigenes Ticket oder Bereichsbearbeiter liest" ON public.support_tickets;
CREATE POLICY "Eigenes Ticket oder Bereichsbearbeiter liest" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_support_topic(topic)
  );

DROP POLICY IF EXISTS "Admin setzt Ticket-Status" ON public.support_tickets;
DROP POLICY IF EXISTS "Bereichsbearbeiter setzt Ticket-Status" ON public.support_tickets;
CREATE POLICY "Bereichsbearbeiter setzt Ticket-Status" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.can_manage_support_topic(topic))
  WITH CHECK (public.can_manage_support_topic(topic));

DROP POLICY IF EXISTS "Eigene Nachricht am sichtbaren Ticket" ON public.support_messages;
CREATE POLICY "Eigene Nachricht am sichtbaren Ticket" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.user_id = auth.uid()
          OR public.can_manage_support_topic(t.topic)
        )
    )
  );

DROP POLICY IF EXISTS "Nachricht sichtbar wie Ticket" ON public.support_messages;
CREATE POLICY "Nachricht sichtbar wie Ticket" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.user_id = auth.uid()
          OR public.can_manage_support_topic(t.topic)
        )
    )
  );
