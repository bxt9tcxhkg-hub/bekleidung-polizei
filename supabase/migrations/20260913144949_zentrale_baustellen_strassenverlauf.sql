alter table public.zentrale_baustellen add column path jsonb;
comment on column public.zentrale_baustellen.path is 'Abgeleiteter Streckenverlauf entlang des Straßennetzes als JSON-Array [[lat,lng],...]; null = Luftlinie zwischen Start-/Endpunkt.';
