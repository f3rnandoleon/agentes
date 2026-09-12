create table if not exists public.sales_contexts (
  conversation_id bigint primary key references public.conversations(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at bigint not null default extract(epoch from now())::bigint
);

alter table public.sales_contexts enable row level security;
