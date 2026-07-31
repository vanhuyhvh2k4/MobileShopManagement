create table if not exists public.part_imports (
  id text primary key,
  part_id text not null references public.parts(id) on delete cascade,
  quantity integer not null default 0,
  unit_cost numeric not null default 0,
  import_datetime timestamptz not null default now(),
  supplier text,
  notes text
);

alter table public.part_imports enable row level security;

drop policy if exists "authenticated app access part imports" on public.part_imports;
drop policy if exists "single admin access part imports" on public.part_imports;

create policy "authenticated app access part imports" on public.part_imports
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
