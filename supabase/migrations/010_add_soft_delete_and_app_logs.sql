alter table public.phones add column if not exists deleted_at timestamptz;
alter table public.phone_faults add column if not exists deleted_at timestamptz;
alter table public.repairs add column if not exists deleted_at timestamptz;
alter table public.parts add column if not exists deleted_at timestamptz;
alter table public.part_imports add column if not exists deleted_at timestamptz;
alter table public.repair_parts add column if not exists deleted_at timestamptz;
alter table public.expenses add column if not exists deleted_at timestamptz;
alter table public.customers add column if not exists deleted_at timestamptz;
alter table public.sales add column if not exists deleted_at timestamptz;

create table if not exists public.app_logs (
  id text primary key,
  action text not null,
  entity_type text not null,
  entity_id text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.app_logs enable row level security;

drop policy if exists "authenticated app access app logs" on public.app_logs;
drop policy if exists "single admin access app logs" on public.app_logs;

create policy "authenticated app access app logs" on public.app_logs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
