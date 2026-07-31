-- Run this after enabling Supabase Authentication for the app.
-- It removes the temporary anonymous-browser policies from 002 and keeps access
-- limited to authenticated Supabase users.

drop policy if exists "anon app access phones" on public.phones;
drop policy if exists "anon app access faults" on public.phone_faults;
drop policy if exists "anon app access repairs" on public.repairs;
drop policy if exists "anon app access parts" on public.parts;
drop policy if exists "anon app access repair parts" on public.repair_parts;
drop policy if exists "anon app access expenses" on public.expenses;
drop policy if exists "anon app access customers" on public.customers;
drop policy if exists "anon app access sales" on public.sales;
drop policy if exists "anon app access settings" on public.settings;

drop policy if exists "single admin access phones" on public.phones;
drop policy if exists "single admin access faults" on public.phone_faults;
drop policy if exists "single admin access repairs" on public.repairs;
drop policy if exists "single admin access parts" on public.parts;
drop policy if exists "single admin access repair parts" on public.repair_parts;
drop policy if exists "single admin access expenses" on public.expenses;
drop policy if exists "single admin access customers" on public.customers;
drop policy if exists "single admin access sales" on public.sales;
drop policy if exists "single admin access settings" on public.settings;

create policy "authenticated app access phones" on public.phones
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access faults" on public.phone_faults
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access repairs" on public.repairs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access parts" on public.parts
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access repair parts" on public.repair_parts
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access expenses" on public.expenses
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access customers" on public.customers
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access sales" on public.sales
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated app access settings" on public.settings
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
