-- Run this in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → paste & run

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  merchant text not null,
  amount numeric(12, 2) not null,
  currency text default 'USD',
  date date,
  category text,
  description text,
  confidence text,
  added_at timestamptz default now()
);

-- Enable Row Level Security (but allow all for now — no auth)
alter table expenses enable row level security;

create policy "Allow all operations" on expenses
  for all using (true) with check (true);
