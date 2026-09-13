-- Die Baustellen-Linie soll dem tatsächlichen Straßenverlauf folgen statt
-- nur eine Luftlinie zwischen Start- und Endpunkt zu sein. Der Streckenzug
-- wird beim Speichern per Routing-Dienst berechnet und hier zusätzlich zu
-- Start-/Endpunkt abgelegt (die bleiben die "Quelle der Wahrheit" fürs
-- spätere Bearbeiten - path ist nur die abgeleitete Darstellung). Ohne Route
-- (Dienst nicht erreichbar) bleibt path null und die Karte zeigt ersatzweise
-- die Luftlinie, wie bisher.
alter table public.zentrale_baustellen add column path jsonb;
comment on column public.zentrale_baustellen.path is 'Abgeleiteter Streckenverlauf entlang des Straßennetzes als JSON-Array [[lat,lng],...]; null = Luftlinie zwischen Start-/Endpunkt.';
