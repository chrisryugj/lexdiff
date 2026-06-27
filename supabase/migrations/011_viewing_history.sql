-- 011: 조회 이력 (Viewing History) — 사용자가 열람한 법령/조례/판례 재조회용
--
-- 로그인 유저: Supabase 저장 + RLS로 본인만 접근 (기기 간 동기화)
-- 게스트: localStorage 유지 (클라이언트 viewing-history-store에서 분기)
-- 로그인 시 게스트 이력 → DB 머지 (favorites 005 패턴)
--
-- 개인정보: 메타정보만 저장(표시용 제목 · 식별자 · 조회시각). 질의/답변 원문 미저장.
-- 보유기간: 마지막 조회 후 180일 경과 시 자동 삭제.

create table if not exists public.viewing_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('law', 'ordinance', 'precedent')),
  item_key text not null,              -- 카테고리별 안정 식별자 (재조회 라우팅 키, upsert 기준)
  title text not null,                 -- 표시용 제목
  law_id text,
  mst text,
  jo text,
  ordinance_seq text,
  precedent_id text,
  metadata jsonb,                      -- joNum/court/orgName/effectiveDate 등 부가 (원문 아님)
  view_count integer not null default 1,
  last_viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, item_key)
);

create index if not exists idx_viewing_history_user
  on public.viewing_history(user_id, last_viewed_at desc);
create index if not exists idx_viewing_history_user_cat
  on public.viewing_history(user_id, category, last_viewed_at desc);

alter table public.viewing_history enable row level security;

drop policy if exists "viewing_history_select_own" on public.viewing_history;
create policy "viewing_history_select_own"
  on public.viewing_history for select using (auth.uid() = user_id);

drop policy if exists "viewing_history_insert_own" on public.viewing_history;
create policy "viewing_history_insert_own"
  on public.viewing_history for insert with check (auth.uid() = user_id);

drop policy if exists "viewing_history_update_own" on public.viewing_history;
create policy "viewing_history_update_own"
  on public.viewing_history for update using (auth.uid() = user_id);

drop policy if exists "viewing_history_delete_own" on public.viewing_history;
create policy "viewing_history_delete_own"
  on public.viewing_history for delete using (auth.uid() = user_id);

-- 180일 자동 삭제 (ai_telemetry 009 retention 패턴)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('viewing_history_retention_180d')
      where exists (select 1 from cron.job where jobname = 'viewing_history_retention_180d');
    perform cron.schedule(
      'viewing_history_retention_180d',
      '40 3 * * *',  -- 매일 KST 12:40
      $ct$delete from public.viewing_history where last_viewed_at < now() - interval '180 days'$ct$
    );
  end if;
exception when others then null;
end $$;

comment on table public.viewing_history is
  '사용자 조회 이력(법령/조례/판례). 메타정보만 저장, 재조회 용도. RLS 본인 한정, 180일 보관.';
