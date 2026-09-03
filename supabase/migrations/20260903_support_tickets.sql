-- Interner Support-Kanal (Tickets, kein Drittanbieter). Idempotent.
-- Operator wendet diese Datei an; der Client sendet nichts an Intercom, Crisp o. Ä.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.profiles (id),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  last_message_at timestamptz DEFAULT now(),
  CONSTRAINT support_tickets_subject_not_empty
    CHECK (char_length(trim(subject)) > 0 AND char_length(subject) <= 120)
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles (id),
  body text NOT NULL,
  from_admin boolean NOT NULL DEFAULT false,
  CONSTRAINT support_messages_body_not_empty
    CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at
  ON public.support_tickets (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
  ON public.support_messages (ticket_id, created_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_tickets FROM PUBLIC, anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.support_tickets FROM authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.support_tickets TO authenticated;

REVOKE ALL ON TABLE public.support_messages FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.support_messages FROM authenticated;
GRANT INSERT, SELECT ON TABLE public.support_messages TO authenticated;

-- from_admin setzt nur die Rolle, Client kann das Flag nicht fälschen.
CREATE OR REPLACE FUNCTION public.prepare_support_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ticket_owner uuid;
BEGIN
  NEW.body := trim(NEW.body);
  IF NEW.body = '' THEN
    RAISE EXCEPTION 'Nachricht darf nicht leer sein';
  END IF;
  IF char_length(NEW.body) > 4000 THEN
    RAISE EXCEPTION 'Nachricht ist zu lang';
  END IF;

  SELECT user_id INTO ticket_owner
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF ticket_owner IS NULL THEN
    RAISE EXCEPTION 'Ticket nicht gefunden';
  END IF;

  NEW.from_admin := has_role('admin') AND ticket_owner IS DISTINCT FROM NEW.author_id;
  RETURN NEW;
END;
$$;

-- Ticket-Zeitstempel und Status nachziehen. DEFINER, weil authenticated
-- Tickets sonst nur als Admin aktualisieren darf.
CREATE OR REPLACE FUNCTION public.touch_support_ticket_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
  SET
    last_message_at = COALESCE(NEW.created_at, now()),
    updated_at = now(),
    status = CASE
      WHEN NEW.from_admin AND status IS DISTINCT FROM 'closed' THEN 'answered'
      ELSE status
    END
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

-- Betreff und Besitzer bleiben unverändert; Status setzt nur der Admin-Client.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_prepare ON public.support_messages;
CREATE TRIGGER support_messages_prepare
  BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.prepare_support_message();

DROP TRIGGER IF EXISTS support_messages_touch_ticket ON public.support_messages;
CREATE TRIGGER support_messages_touch_ticket
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket_on_message();

DROP TRIGGER IF EXISTS support_tickets_protect ON public.support_tickets;
CREATE TRIGGER support_tickets_protect
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.protect_support_ticket_update();

DROP TRIGGER IF EXISTS support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

REVOKE ALL ON FUNCTION public.prepare_support_message() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_support_ticket_on_message() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.protect_support_ticket_update() FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Angemeldete legen eigenes Ticket an" ON public.support_tickets;
CREATE POLICY "Angemeldete legen eigenes Ticket an" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Eigenes Ticket oder Admin liest" ON public.support_tickets;
CREATE POLICY "Eigenes Ticket oder Admin liest" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role('admin'));

DROP POLICY IF EXISTS "Admin setzt Ticket-Status" ON public.support_tickets;
CREATE POLICY "Admin setzt Ticket-Status" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

DROP POLICY IF EXISTS "Eigene Nachricht am sichtbaren Ticket" ON public.support_messages;
CREATE POLICY "Eigene Nachricht am sichtbaren Ticket" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      has_role('admin')
      OR EXISTS (
        SELECT 1
        FROM public.support_tickets t
        WHERE t.id = ticket_id
          AND t.user_id = auth.uid()
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
        AND (t.user_id = auth.uid() OR has_role('admin'))
    )
  );
