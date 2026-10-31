-- What If Studio: one JSON document per project, isolated by Supabase Auth user.
-- Run this file in Supabase SQL Editor before enabling cloud sync.
create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_id_idx on public.projects (user_id);
alter table public.projects enable row level security;

drop policy if exists "Users can read their own projects" on public.projects;
create policy "Users can read their own projects" on public.projects for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects" on public.projects for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects" on public.projects for delete using (auth.uid() = user_id);

-- The browser uses only the public anon/publishable key.
-- Never put the service_role key in the app or in a public repository.


-- Atomic per-user daily quota for AI generation (20 requests per UTC day).
create table if not exists public.ai_generation_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  generations integer not null default 0 check (generations >= 0),
  primary key (user_id, usage_date)
);

alter table public.ai_generation_usage enable row level security;
revoke all on public.ai_generation_usage from anon, authenticated;

create or replace function public.consume_ai_quota()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  insert into public.ai_generation_usage (user_id, usage_date, generations)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date)
  do update
    set generations = public.ai_generation_usage.generations + 1
    where public.ai_generation_usage.generations < 20
  returning generations into new_count;

  if new_count is null then
    raise exception 'daily_generation_limit_reached';
  end if;

  return new_count;
end;
$$;

revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
