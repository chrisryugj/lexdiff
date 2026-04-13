-- 005: 즐겨찾기 DB화 (유저별 영속화 + 기기 간 동기화)
--
-- 로그인 유저: Supabase 저장 + RLS로 본인만 접근
-- 게스트: localStorage 유지 (클라이언트 favorites-store에서 분기)
-- 로그인 시 게스트 즐찾 → DB 머지 (on conflict do nothing)

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  law_id text,
  mst text,
  law_title text not null,
  jo text not null,
  last_seen_signature text not null,
  effective_date text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, law_title, jo)
);

create index if not exists idx_favorites_user on public.favorites(user_id, created_at desc);

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
  on public.favorites for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own"
  on public.favorites for update using (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
  on public.favorites for delete using (auth.uid() = user_id);
