-- Für den Ausdruck einer Überstundenmeldung vor der Entscheidung: gibt es
-- genau einen aktiven Admin/Genehmiger/Approver, soll dessen Name statt "–"
-- als voraussichtlicher Unterzeichner erscheinen - unabhängig davon, wer
-- gerade druckt (auch ein einfacher Bediensteter, der seine eigene Meldung
-- für den Genehmiger ausdruckt). Ein normaler Bediensteter darf laut RLS
-- die Rollen anderer Profile aber gar nicht einsehen ("Jeder sieht eigenes
-- Profil"), daher reicht eine reine Client-Abfrage nicht - SECURITY DEFINER
-- gibt gezielt nur den Namen heraus, und auch nur, wenn er eindeutig ist
-- (bei mehreren möglichen Genehmigern bleibt es bei "–", da nicht klar ist,
-- wer tatsächlich entscheiden wird).
create or replace function public.sole_genehmiger_name()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case when count(*) = 1 then max(name) else null end
  from public.profiles
  where active = true and (roles && array['admin', 'genehmiger', 'approver']);
$$;

grant execute on function public.sole_genehmiger_name() to authenticated;
