-- Supabase schema for Fantasy Draft War Room 2026
-- Run this in Supabase SQL Editor.

create table if not exists public.fantasy_players (
  id text primary key,
  name text not null,
  team text,
  pos text,
  custom_rank integer,
  tier integer,
  sources jsonb default '{}'::jsonb,
  notes text default '',
  drafted boolean default false,
  drafted_by text default '',
  pick integer,
  updated_at timestamptz default now()
);

alter table public.fantasy_players enable row level security;

-- Public draft-board policies.
-- This makes the board editable by anyone who can access your GitHub Pages site.
-- If you want private editing later, replace these with authenticated-user policies.
drop policy if exists "Public read fantasy players" on public.fantasy_players;
create policy "Public read fantasy players"
on public.fantasy_players for select
to anon, authenticated
using (true);

drop policy if exists "Public insert fantasy players" on public.fantasy_players;
create policy "Public insert fantasy players"
on public.fantasy_players for insert
to anon, authenticated
with check (true);

drop policy if exists "Public update fantasy players" on public.fantasy_players;
create policy "Public update fantasy players"
on public.fantasy_players for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public delete fantasy players" on public.fantasy_players;
create policy "Public delete fantasy players"
on public.fantasy_players for delete
to anon, authenticated
using (true);

-- Enable realtime for the table.
alter publication supabase_realtime add table public.fantasy_players;
