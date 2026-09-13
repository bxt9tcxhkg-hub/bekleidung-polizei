-- Eine Person hat genau eine Telefonnummer im gemeinsamen Register, aber mit
-- Angabe, wann diese Nummer erhoben wurde (kann von "heute erfasst" abweichen,
-- z. B. bei einer älteren Vernehmung nacherfasst).
alter table public.operational_phone_numbers add column erhoben_am date not null default current_date;
