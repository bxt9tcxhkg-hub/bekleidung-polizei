-- Fix zu 20260921110000/20260921120000: Die beiden vorherigen Migrationen
-- haben nur die RLS-Policies für DELETE auf support_messages/support_tickets
-- angelegt, aber das darunterliegende GRANT DELETE an die Rolle
-- `authenticated` vergessen. Ohne dieses GRANT scheitert jeder Löschversuch
-- schon auf SQL-Ebene mit "permission denied for table ..." - die
-- RLS-Policy wird nie erreicht, unabhängig davon, ob sie zutrifft.

GRANT DELETE ON public.support_messages TO authenticated;
GRANT DELETE ON public.support_tickets TO authenticated;
