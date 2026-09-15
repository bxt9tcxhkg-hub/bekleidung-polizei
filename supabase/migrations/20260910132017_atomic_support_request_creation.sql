CREATE OR REPLACE FUNCTION public.create_support_request(p_subject text,p_kind text,p_topic text,p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE ticket_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND active) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_subject IS NULL OR btrim(p_subject)='' OR p_body IS NULL OR btrim(p_body)='' THEN RAISE EXCEPTION 'Betreff und Nachricht fehlen'; END IF;
  INSERT INTO support_tickets(user_id,subject,kind,topic) VALUES(auth.uid(),p_subject,p_kind,p_topic) RETURNING id INTO ticket_id;
  INSERT INTO support_messages(ticket_id,author_id,body,from_admin) VALUES(ticket_id,auth.uid(),p_body,false);
  RETURN ticket_id;
END $$;
REVOKE ALL ON FUNCTION public.create_support_request(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_support_request(text,text,text,text) TO authenticated;

