alter table public.phones
  add column if not exists asking_price numeric not null default 0;
