-- 009: AI 텔레메트리 — 본문 없는 관찰성 로그 (개인정보 무관)
--
-- 목적: 개발/디버깅/품질 개선용 집계 신호 수집.
-- 저장 금지: 쿼리 원문, 답변 원문, user_id, IP, UA 원본, 도구 인자.
-- 저장 허용: 분류기 출력, 단계별 latency, 도구 이름, 품질 지표, 법령 ID, 모델 메타.
--
-- 법적 근거: 개인정보에 해당하지 않는 집계 데이터. 약관 개정 불필요.
-- k-anonymity: 분석 쿼리에서 row <5 버킷은 자동 마스킹 (뷰 레이어).
--
-- 004의 ai_query_logs 는 deprecate (본문 저장 리스크 제거) — 신규 쓰기 중단, 기존 데이터는 30일 보관 크론으로 자동 소멸.

create table if not exists public.ai_telemetry (
  id                      bigserial primary key,
  created_at              timestamptz not null default now(),

  -- 요청 맥락
  endpoint                text not null,                 -- fc-rag|summarize|impact-tracker|benchmark-analyze|impact-analysis
  is_byok                 boolean not null default false,
  session_anon            text,                          -- 30분 윈도우 해시 (영속 식별 X)
  is_followup             boolean,
  ua_class                text,                          -- mobile|desktop|tablet
  lang                    text,                          -- ko|en

  -- 분류기 출력
  complexity              text,                          -- simple|complex
  query_type              text,                          -- definition|application|procedure|scope
  domain                  text,                          -- tax|labor|...
  query_length_bucket     text,                          -- <50|50-200|200-500|500+
  answer_length_bucket    text,

  -- 파이프라인 성능 (ms)
  latency_total_ms        int,
  latency_router_ms       int,
  latency_retrieval_ms    int,
  latency_generation_ms   int,
  latency_verification_ms int,

  -- 도구 호출
  tool_calls_count        int,
  tool_names              text[],
  tool_errors             text[],
  retry_count             int,
  fallback_triggered      boolean,
  fast_path_used          boolean,

  -- 품질 지표
  confidence_level        text,                          -- high|medium|low
  confidence_score        int,
  quality_score           int,
  has_grounds_section     boolean,
  is_truncated            boolean,
  citation_count          int,
  verified_count          int,
  verification_methods    jsonb,                         -- {"eflaw-lookup":3,"skipped":1}
  cited_law_ids           text[],                        -- MST 코드 (공공정보)

  -- 에러 (원본 메시지 X — 카테고리만)
  error_category          text,                          -- timeout|model_503|tool_fail|validation|quota|unknown
  error_tool              text,

  -- 모델 메타
  model_id_actual         text,                          -- 실제 모델 ID (ex: gemini-3-flash-preview)
  input_tokens            int,
  output_tokens           int,
  cached_tokens           int,
  cost_estimate_usd       numeric(10, 6)
);

create index if not exists idx_ai_tel_created       on public.ai_telemetry (created_at desc);
create index if not exists idx_ai_tel_endpoint_time on public.ai_telemetry (endpoint, created_at desc);
create index if not exists idx_ai_tel_error_cat     on public.ai_telemetry (error_category) where error_category is not null;
create index if not exists idx_ai_tel_cited_laws    on public.ai_telemetry using gin (cited_law_ids);
create index if not exists idx_ai_tel_tool_names    on public.ai_telemetry using gin (tool_names);
create index if not exists idx_ai_tel_domain        on public.ai_telemetry (domain, created_at desc) where domain is not null;

-- RLS: 전면 차단. service_role만 write, 읽기는 직접 DB 접근 (admin) 전용.
alter table public.ai_telemetry enable row level security;
drop policy if exists "ai_telemetry_no_access" on public.ai_telemetry;
create policy "ai_telemetry_no_access"
  on public.ai_telemetry for all using (false) with check (false);

-- 90일 자동 삭제 (개발용 — 필요 시 조정)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ai_telemetry_retention_90d')
      where exists (select 1 from cron.job where jobname = 'ai_telemetry_retention_90d');
    perform cron.schedule(
      'ai_telemetry_retention_90d',
      '20 3 * * *',  -- 매일 KST 12:20
      $ct$delete from public.ai_telemetry where created_at < now() - interval '90 days'$ct$
    );
  end if;
exception when others then null;
end $$;

comment on table public.ai_telemetry is
  '본문 없는 AI 파이프라인 텔레메트리. 개인정보 무관, 약관 외 수집. BYOK/로그인 구분 없이 전체 요청 기록.';
