-- Use this migration only when the app is deployed as a private single-user tool
-- without Supabase Auth login. The anon key is public in a browser app, so these
-- policies allow anyone with the app URL/key to read and write these tables.

create policy "anon app access phones" on public.phones
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access faults" on public.phone_faults
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access repairs" on public.repairs
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access parts" on public.parts
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access repair parts" on public.repair_parts
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access expenses" on public.expenses
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access customers" on public.customers
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access sales" on public.sales
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "anon app access settings" on public.settings
  for all using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));
