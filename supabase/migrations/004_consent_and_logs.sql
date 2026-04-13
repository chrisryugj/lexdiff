-- 004: 약관/개인정보 동의 + AI 질의 로그 (개인정보보호법 대응)
--
-- 1. user_consents — 필수/선택 동의 이력 (약관 버전 포함)
-- 2. ai_query_logs — AI 질의 로그 (opt-in한 사용자 한정, 30일 보관)
--    * user_id 직접 저장하지 않고 익명 해시(anon_user_hash)로만 연결
--    * 저장 전 PII 스크러빙 (lib/privacy/scrubber.ts)
-- 3. pg_cron 기반 30일 경과 row 자동 삭제
-- 4. RLS: 본인 consent만 read/update, ai_query_logs는 service_role 전용

-- ── 1. user_consents ────────────────────────────────────────────
create table if not exists public.user_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  ai_logging_opt_in boolean not null default false,
  agreed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_consents enable row level security;

drop policy if exists "consents_select_own" on public.user_consents;
create policy "consents_select_own"
  on public.user_consents for select using (auth.uid() = user_id);

drop policy if exists "consents_upsert_own" on public.user_consents;
create policy "consents_upsert_own"
  on public.user_consents for insert with check (auth.uid() = user_id);

drop policy if exists "consents_update_own" on public.user_consents;
create policy "consents_update_own"
  on public.user_consents for update using (auth.uid() = user_id);

-- ── 2. ai_query_logs ────────────────────────────────────────────
create table if not exists public.ai_query_logs (
  id bigserial primary key,
  anon_user_hash text not null,
  query_scrubbed text not null,
  query_type text,
  domain text,
  source text,
  model text,
  tool_calls jsonb,
  answer text,
  latency_ms int,
  citation_count int,
  verified_count int,
  feedback smallint,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_query_logs_anon on public.ai_query_logs(anon_user_hash);
create index if not exists idx_ai_query_logs_created on public.ai_query_logs(created_at);

alter table public.ai_query_logs enable row level security;
-- 일반 사용자 접근 전면 차단 (service_role만 bypass)
drop policy if exists "ai_query_logs_no_access" on public.ai_query_logs;
create policy "ai_query_logs_no_access"
  on public.ai_query_logs for all using (false) with check (false);

-- ── 3. 30일 보관 — pg_cron 자동 삭제 ────────────────────────────
-- pg_cron은 Supabase 대시보드에서 확장 활성화 필요 (Database > Extensions > pg_cron)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ai_query_logs_retention_30d')
      where exists (select 1 from cron.job where jobname = 'ai_query_logs_retention_30d');
    perform cron.schedule(
      'ai_query_logs_retention_30d',
      '15 3 * * *',  -- 매일 KST 12:15
      $ct$delete from public.ai_query_logs where created_at < now() - interval '30 days'$ct$
    );
  end if;
exception when others then null;
end $$;

-- ── 4. 사용자 본인 로그 삭제 RPC (개인정보 삭제 요청권) ─────────
-- anon_user_hash 계산 로직은 애플리케이션 레이어와 동일해야 함
-- (lib/privacy/anon-hash.ts — HMAC-SHA256(user_id, SUPABASE_LOG_SALT))
create or replace function public.delete_my_ai_logs(p_anon_hash text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.ai_query_logs where anon_user_hash = p_anon_hash;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.delete_my_ai_logs(text) to service_role;
