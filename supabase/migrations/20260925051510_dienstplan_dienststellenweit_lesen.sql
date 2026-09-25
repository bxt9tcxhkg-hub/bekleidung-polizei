-- Schritt 4-5 des Dienstplan-Imports: Dienststellenkalender (wer hat wann
-- Dienst) braucht Lesezugriff auf ALLE Bediensteten eines veröffentlichten
-- Monats, nicht nur auf die eigenen Zeilen - die bisherige Policy aus
-- 20260925021129_dienstplan_import.sql erlaubte einem einfachen Bediensteten
-- nur die eigenen Diensteinträge zu sehen (gedacht für eine spätere reine
-- "Meine Dienste"-Seite). Analog zu duty_assignments/duty_functions
-- (Migration 20260919070000_tagesfunktion_zugriff.sql): wer Dienst hat, ist
-- Basisinformation für die ganze Dienststelle, keine bereichsgebundene oder
-- vertrauliche Information.
drop policy "Dienstplan-Dienste lesen" on public.dienstplan_dienste;

create policy "Dienstplan-Dienste dienststellenweit lesen" on public.dienstplan_dienste
for select to authenticated using (
  public.has_role('admin')
  or (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
    and exists (select 1 from public.dienstplan_monate m where m.id = dienstplan_monat_id and m.status = 'veroeffentlicht')
  )
);
