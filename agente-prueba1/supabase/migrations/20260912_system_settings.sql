create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at bigint not null default extract(epoch from now())::bigint
);

alter table public.system_settings enable row level security;
