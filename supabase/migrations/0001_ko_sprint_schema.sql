-- ============================================================
-- KO Weekend Sprint — reproducible schema (run in the JP Atlas
-- Supabase project, or any Postgres+Supabase project).
-- All objects are prefixed ko_sprint_ and isolated by RLS.
-- This reflects the live state after the one-time content seed
-- (the temporary seed/upload policies are intentionally NOT here;
--  they were dropped after seeding).
-- ============================================================

-- ---- Tables --------------------------------------------------------------
create table if not exists public.ko_sprint_allowed_users (
  email        text primary key,
  display_name text,
  role         text default 'student',
  created_at   timestamptz default now()
);

create table if not exists public.ko_sprint_learning_items (
  id         text primary key,
  item_type  text not null check (item_type in ('hangul','word')),
  sort_order int  not null,
  payload    jsonb not null,
  created_at timestamptz default now()
);
create index if not exists ko_sprint_items_type_order_idx
  on public.ko_sprint_learning_items (item_type, sort_order);

create table if not exists public.ko_sprint_fsrs_cards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  item_id        text not null references public.ko_sprint_learning_items(id) on delete cascade,
  direction      text not null,
  due            timestamptz,
  stability      double precision,
  difficulty     double precision,
  elapsed_days   int default 0,
  scheduled_days int default 0,
  reps           int default 0,
  lapses         int default 0,
  state          text default 'new',
  last_review    timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (user_id, item_id, direction)
);
create index if not exists ko_sprint_cards_user_due_idx
  on public.ko_sprint_fsrs_cards (user_id, due);

create table if not exists public.ko_sprint_review_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  card_id     uuid not null references public.ko_sprint_fsrs_cards(id) on delete cascade,
  rating      text not null check (rating in ('again','hard','good','easy')),
  reviewed_at timestamptz default now(),
  response_ms int,
  device      text,
  metadata    jsonb
);
create index if not exists ko_sprint_logs_user_idx
  on public.ko_sprint_review_logs (user_id, reviewed_at);

-- ---- Allowlist gate helper ----------------------------------------------
create or replace function public.ko_sprint_is_allowed()
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.ko_sprint_allowed_users a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---- Grants (RLS still governs row access) -------------------------------
grant select on public.ko_sprint_learning_items to authenticated;

-- ---- Row Level Security --------------------------------------------------
alter table public.ko_sprint_allowed_users  enable row level security;
alter table public.ko_sprint_learning_items enable row level security;
alter table public.ko_sprint_fsrs_cards      enable row level security;
alter table public.ko_sprint_review_logs     enable row level security;

drop policy if exists ko_sprint_allowed_self_read on public.ko_sprint_allowed_users;
create policy ko_sprint_allowed_self_read on public.ko_sprint_allowed_users
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists ko_sprint_items_read on public.ko_sprint_learning_items;
create policy ko_sprint_items_read on public.ko_sprint_learning_items
  for select to authenticated
  using (public.ko_sprint_is_allowed());

drop policy if exists ko_sprint_cards_rw on public.ko_sprint_fsrs_cards;
create policy ko_sprint_cards_rw on public.ko_sprint_fsrs_cards
  for all to authenticated
  using (auth.uid() = user_id and public.ko_sprint_is_allowed())
  with check (auth.uid() = user_id and public.ko_sprint_is_allowed());

drop policy if exists ko_sprint_logs_rw on public.ko_sprint_review_logs;
create policy ko_sprint_logs_rw on public.ko_sprint_review_logs
  for all to authenticated
  using (auth.uid() = user_id and public.ko_sprint_is_allowed())
  with check (auth.uid() = user_id and public.ko_sprint_is_allowed());

-- ---- Storage bucket for app + audio (public read) ------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ko-sprint', 'ko-sprint', true, 10485760,
  array['audio/mpeg','audio/mp3','text/html','text/css','application/javascript',
        'text/javascript','image/png','image/svg+xml','image/x-icon',
        'application/json','text/plain','application/manifest+json']
)
on conflict (id) do update set public = true;

-- NOTE: content + audio are loaded into ko_sprint_learning_items and the
-- ko-sprint bucket by the pipeline scripts (build_content.py / generate_audio.py
-- / upload_to_storage.py), which use temporary write policies dropped immediately
-- after. Writes otherwise require the service-role key.
