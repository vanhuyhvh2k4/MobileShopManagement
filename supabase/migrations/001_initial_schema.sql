create table if not exists public.phones (
  id text primary key,
  imei1 text not null,
  imei2 text,
  brand text not null,
  model text not null,
  color text,
  storage text,
  ram text,
  carrier text,
  accessories text,
  seller_name text,
  seller_phone text,
  purchase_price numeric not null default 0,
  purchase_deposit numeric not null default 0,
  shipping_fee numeric not null default 0,
  asking_price numeric not null default 0,
  purchase_date date not null,
  status text not null check (
    status in ('Purchased', 'Waiting Inspection', 'Waiting Repair', 'Repairing', 'Ready For Sale', 'Reserved', 'Sold')
  ),
  notes text,
  image_front text,
  image_back text,
  image_imei text,
  image_accessories text,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.phone_faults (
  id text primary key,
  phone_id text not null references public.phones(id) on delete cascade,
  fault_name text not null,
  deleted_at timestamptz
);

create table if not exists public.repairs (
  id text primary key,
  phone_id text not null references public.phones(id) on delete cascade,
  repair_date date not null,
  description text not null default '',
  technician text,
  labor_cost numeric not null default 0,
  notes text,
  deleted_at timestamptz
);

create table if not exists public.parts (
  id text primary key,
  brand text,
  name text not null,
  category text not null default '',
  compatible_models text,
  purchase_cost numeric not null default 0,
  quantity integer not null default 0,
  minimum_stock integer not null default 0,
  supplier text,
  notes text,
  deleted_at timestamptz
);

create table if not exists public.part_imports (
  id text primary key,
  part_id text not null references public.parts(id) on delete cascade,
  quantity integer not null default 0,
  unit_cost numeric not null default 0,
  import_datetime timestamptz not null default now(),
  supplier text,
  notes text,
  deleted_at timestamptz
);

create table if not exists public.repair_parts (
  id text primary key,
  repair_id text not null references public.repairs(id) on delete cascade,
  part_id text not null references public.parts(id),
  quantity integer not null default 1,
  unit_cost numeric not null default 0,
  deleted_at timestamptz
);

create table if not exists public.expenses (
  id text primary key,
  phone_id text references public.phones(id) on delete set null,
  amount numeric not null default 0,
  category text not null,
  description text not null default '',
  date date not null default current_date,
  deleted_at timestamptz
);

create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text not null,
  address text,
  notes text,
  deleted_at timestamptz
);

create table if not exists public.sales (
  id text primary key,
  phone_id text not null references public.phones(id),
  customer_id text not null references public.customers(id),
  sale_price numeric not null default 0,
  deposit_amount numeric not null default 0,
  sale_date date not null,
  sale_datetime timestamptz,
  delivery_status text not null default 'pending_delivery' check (
    delivery_status in ('pending_delivery', 'delivered', 'not_received')
  ),
  notes text,
  deleted_at timestamptz
);

create table if not exists public.app_logs (
  id text primary key,
  action text not null,
  entity_type text not null,
  entity_id text,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key,
  business_name text not null,
  default_warranty integer not null default 3,
  currency text not null default 'VND',
  dark_mode boolean not null default false
);

alter table public.phones enable row level security;
alter table public.phone_faults enable row level security;
alter table public.repairs enable row level security;
alter table public.parts enable row level security;
alter table public.part_imports enable row level security;
alter table public.repair_parts enable row level security;
alter table public.expenses enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.settings enable row level security;
alter table public.app_logs enable row level security;

create policy "single admin access phones" on public.phones for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access faults" on public.phone_faults for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access repairs" on public.repairs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access parts" on public.parts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access part imports" on public.part_imports for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access repair parts" on public.repair_parts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access expenses" on public.expenses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access customers" on public.customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access sales" on public.sales for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access settings" on public.settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "single admin access app logs" on public.app_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
