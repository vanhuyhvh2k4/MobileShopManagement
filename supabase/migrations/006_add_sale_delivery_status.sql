alter table public.sales
  add column if not exists delivery_status text not null default 'delivered';

alter table public.sales
  drop constraint if exists sales_delivery_status_check;

alter table public.sales
  add constraint sales_delivery_status_check
  check (delivery_status in ('pending_delivery', 'delivered', 'not_received'));
