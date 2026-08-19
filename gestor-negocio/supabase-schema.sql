

create table if not exists public.requests (
  id bigint primary key,
  source text,
  product text,
  items text,
  related_products text,
  total numeric(12,2) default 0,
  name text,
  "lastName" text,
  whatsapp text,
  email text,
  quantity integer default 1,
  municipality text,
  parish text,
  address text,
  delivery text,
  comment text,
  date text,
  status text,
  created_at timestamptz default now()
);

alter table public.requests enable row level security;
create policy "Public read requests" on public.requests
  for select
  using (true);
create policy "Public insert requests" on public.requests
  for insert
  with check (true);
create policy "Public update requests" on public.requests
  for update
  using (true)
  with check (true);

create table if not exists public.blogs (
  id bigint primary key,
  title text,
  excerpt text,
  image text,
  content text,
  related text,
  date text,
  created_at timestamptz default now()
);
