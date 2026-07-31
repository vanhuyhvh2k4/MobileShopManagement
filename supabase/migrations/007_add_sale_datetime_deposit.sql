alter table public.sales
  add column if not exists deposit_amount numeric not null default 0;

alter table public.sales
  add column if not exists sale_datetime timestamptz;

update public.sales
set sale_datetime = sale_date::timestamptz
where sale_datetime is null;
