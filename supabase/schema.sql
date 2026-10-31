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
