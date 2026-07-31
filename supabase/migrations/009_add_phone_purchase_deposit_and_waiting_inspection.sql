alter table public.phones
  add column if not exists purchase_deposit numeric not null default 0;

alter table public.phones
  drop constraint if exists phones_status_check;

alter table public.phones
  add constraint phones_status_check
  check (status in ('Purchased', 'Waiting Inspection', 'Waiting Repair', 'Repairing', 'Ready For Sale', 'Reserved', 'Sold'));
