-- 012: AI 답변 피드백 — 사용자 명시적 클릭 수집 (고지 기반)
--
-- good        : 본문 없음(메타만).
-- bad/improve : 질문·답변 본문 포함 (품질 개선용).
-- 상시 자동수집 아님 — 사용자가 피드백 버튼을 누른 경우에만 1건 기록.
--
-- 법령질의 자동 로깅(004 ai_query_logs)은 010에서 폐기됨. 본 테이블은 그 대체가 아니라
-- '명시적 피드백' 채널 — 부정 피드백에 한해 개선 목적으로 해당 문답을 보관.
--
-- RLS 전면 차단: service_role write only, 읽기는 admin 직접 DB.

create table if not exists public.ai_answer_feedback (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),

  feedback_type   text not null check (feedback_type in ('good','bad','improve')),
  engine          text,                       -- relay(Themis)|gemini
  query_type      text,                       -- definition|application|... (분류기 출력)
  answer_id       text,                       -- 클라 생성 답변 식별자 (중복 방지)
  conversation_id text,
  session_anon    text,                       -- 30분 윈도우 해시 (영속 식별 X)
  is_byok         boolean not null default false,
  ua_class        text,                       -- mobile|desktop|tablet

  -- 부정 피드백만 본문 보관 (good 은 null)
  query           text,
  answer          text
);

create index if not exists idx_ai_fb_created on public.ai_answer_feedback (created_at desc);
create index if not exists idx_ai_fb_type    on public.ai_answer_feedback (feedback_type, created_at desc);

-- RLS: 전면 차단. service_role만 write, 읽기는 직접 DB 접근(admin) 전용.
alter table public.ai_answer_feedback enable row level security;
drop policy if exists "ai_answer_feedback_no_access" on public.ai_answer_feedback;
create policy "ai_answer_feedback_no_access"
  on public.ai_answer_feedback for all using (false) with check (false);

-- 180일 자동 삭제 (개선 분석 주기 고려)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ai_answer_feedback_retention_180d')
      where exists (select 1 from cron.job where jobname = 'ai_answer_feedback_retention_180d');
    perform cron.schedule(
      'ai_answer_feedback_retention_180d',
      '25 3 * * *',
      $ct$delete from public.ai_answer_feedback where created_at < now() - interval '180 days'$ct$
    );
  end if;
exception when others then null;
end $$;

comment on table public.ai_answer_feedback is
  'AI 답변 사용자 피드백. good=메타만, bad/improve=질문·답변 본문 포함(품질개선). 고지 후 명시적 클릭 수집.';
