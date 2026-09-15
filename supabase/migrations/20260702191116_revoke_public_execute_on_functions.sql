-- EXECUTE-Grant an PUBLIC entfernen (Default-Grant von Postgres)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(text) FROM PUBLIC;
-- has_role wird in RLS-Policies ausgewertet und muss für angemeldete Benutzer ausführbar bleiben
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
