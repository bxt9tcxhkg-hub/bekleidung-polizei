-- Nicht geheime Konfiguration für mögliche Stadt-IT-Anbindungen. Keine Token,
-- Passwörter oder API-Schlüssel in dieser Tabelle oder im Browser speichern.
create table public.portal_integration_settings (
  id text primary key check (id in ('outlook', 'rainbow')),
  outlook_source text check (outlook_source in ('postfach', 'organisationskontakte')),
  outlook_mailbox text check (outlook_mailbox is null or length(outlook_mailbox) <= 255),
  outlook_folder_id text check (outlook_folder_id is null or length(outlook_folder_id) <= 255),
  rainbow_called_number text check (rainbow_called_number is null or length(rainbow_called_number) <= 50),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint portal_integration_settings_provider_fields check (
    (id = 'outlook' and outlook_source is not null and rainbow_called_number is null)
    or (id = 'rainbow' and outlook_source is null and outlook_mailbox is null and outlook_folder_id is null)
  )
);

insert into public.portal_integration_settings (id, outlook_source)
values ('outlook', 'postfach'), ('rainbow', null);

create trigger portal_integration_settings_updated_at before update on public.portal_integration_settings
for each row execute function public.update_updated_at();

alter table public.portal_integration_settings enable row level security;
revoke all on public.portal_integration_settings from anon, authenticated;
grant select on public.portal_integration_settings to authenticated;
grant update (outlook_source, outlook_mailbox, outlook_folder_id, rainbow_called_number, updated_by)
on public.portal_integration_settings to authenticated;

create policy "Integrationen nur Admin lesen" on public.portal_integration_settings
for select to authenticated using (public.has_role('admin'));
create policy "Integrationen nur Admin ändern" on public.portal_integration_settings
for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- Outlook-Kontakte erhalten eine getrennte, lesbare Ablage: lokale Kontakte
-- bleiben immer unverändert. Spätere Synchronisation erfolgt nur serverseitig.
create table public.integration_outlook_contacts (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (length(source_key) between 1 and 255),
  external_id text not null check (length(external_id) between 1 and 255),
  name text not null check (length(trim(name)) between 1 and 200),
  institution text check (institution is null or length(institution) <= 200),
  funktion text check (funktion is null or length(funktion) <= 200),
  telefon text check (telefon is null or length(telefon) <= 50),
  email text check (email is null or length(email) <= 200),
  synced_at timestamptz not null default now(),
  unique (source_key, external_id)
);

create index integration_outlook_contacts_name_idx on public.integration_outlook_contacts (name);
alter table public.integration_outlook_contacts enable row level security;
revoke all on public.integration_outlook_contacts from anon, authenticated;
grant select on public.integration_outlook_contacts to authenticated;
create policy "Outlook-Kontakte dienstlich lesen" on public.integration_outlook_contacts
for select to authenticated using (
  public.has_portal_area_access('zentrale') or public.has_portal_area_access('datenpflege')
  or public.is_operative_duty_today()
);

-- Nur der spätere geprüfte Rainbow-Empfänger darf schreiben (service_role).
-- Die Anruf-ID ermöglicht Entdoppelung bei Wiederholung/Weiterleitung.
create table public.integration_rainbow_calls (
  id uuid primary key default gen_random_uuid(),
  call_id text not null check (length(call_id) between 1 and 200),
  rainbow_user_id text not null check (length(rainbow_user_id) between 1 and 200),
  caller_phone text check (caller_phone is null or length(caller_phone) <= 50),
  called_phone text check (called_phone is null or length(called_phone) <= 50),
  status text not null check (status in ('klingelt', 'angenommen', 'beendet')),
  started_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (rainbow_user_id, call_id)
);

create index integration_rainbow_calls_started_at_idx on public.integration_rainbow_calls (started_at desc);
alter table public.integration_rainbow_calls enable row level security;
revoke all on public.integration_rainbow_calls from anon, authenticated;
grant select on public.integration_rainbow_calls to authenticated;
create policy "Rainbow-Anrufe Zentrale lesen" on public.integration_rainbow_calls
for select to authenticated using (public.is_zentralist_on_duty() or public.can_manage_zentrale());
