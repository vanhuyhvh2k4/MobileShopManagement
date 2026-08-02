-- Add status column to part_imports table
alter table public.part_imports
  add column if not exists status text not null default 'importing'
  check (status in ('importing', 'imported'));

-- Update existing records to have 'imported' status (vì các bản ghi cũ đã được nhập kho rồi)
update public.part_imports
  set status = 'imported'
  where status is null or status = 'importing';

-- Create index for status queries
create index if not exists idx_part_imports_status on public.part_imports(status);
