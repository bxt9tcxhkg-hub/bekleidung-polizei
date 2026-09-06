-- Login ohne Session: profiles.username → auth.users.email.
-- profiles ist per RLS für anon nicht lesbar; daher SECURITY DEFINER,
-- nur die eine Auth-E-Mail, exakter Username (klein, kein dn{N}).

CREATE OR REPLACE FUNCTION public.lookup_login_email(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(u.email)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.username = lower(trim(p_username))
    AND p.username IS NOT NULL
    AND lower(trim(p_username)) ~ '^[a-z0-9._-]+$'
    AND lower(trim(p_username)) !~ '^dn[0-9]+$'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_login_email(text) TO anon, authenticated;

COMMENT ON FUNCTION public.lookup_login_email(text) IS
  'Anonyme Login-Hilfe: PC-Benutzername (profiles.username) zur Auth-E-Mail. Liefert nur eine Adresse.';
