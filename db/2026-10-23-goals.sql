-- Savings goals (applied to Supabase project rnngqrwyfqmuyqpetfyo as migration "savings_goals").
create table public.goals (
  id text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  name text not null,
  price numeric not null check (price > 0),
  target_date date,
  priority integer not null default 0,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  bought_row bigint references public.transactions(n)
);

create table public.goal_moves (
  id bigint generated always as identity primary key,
  goal_id text not null references public.goals(id) on delete cascade,
  at timestamptz not null default now(),
  amount numeric not null,
  kind text not null check (kind in ('sweep', 'transfer', 'moni', 'manual', 'purchase', 'leftover')),
  tx_row bigint references public.transactions(n),
  note text not null default ''
);
create index goal_moves_goal_idx on public.goal_moves (goal_id, at);

alter table public.transactions add column goal_id text references public.goals(id);

alter table public.goals enable row level security;
alter table public.goal_moves enable row level security;

insert into public.settings (key, value) values
  ('goal_cap', '8000'::jsonb),
  ('goal_sweep', '{"weekday": 0, "hour": 21}'::jsonb)
on conflict (key) do nothing;
