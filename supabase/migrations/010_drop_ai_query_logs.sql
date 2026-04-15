-- 010: 레거시 ai_query_logs 테이블 및 관련 객체 완전 제거
--
-- 배경: 009에서 본문 없는 ai_telemetry 로 전환. 본문 저장 리스크(쿼리/답변 원문) 완전 제거를 위해
--       기존 ai_query_logs 와 부수 객체를 드롭한다.
--
-- 주의: 이전 30일 보관 로그가 있다면 실행 시점에 삭제됨. 의도된 삭제.
--       user_consents.ai_logging_opt_in 컬럼은 호환성을 위해 남겨둔다 (미사용 상태 유지).

-- 1. 크론 잡 해제
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ai_query_logs_retention_30d')
      where exists (select 1 from cron.job where jobname = 'ai_query_logs_retention_30d');
  end if;
exception when others then null;
end $$;

-- 2. RPC 함수 드롭
drop function if exists public.delete_my_ai_logs(text);

-- 3. 테이블 드롭 (RLS 정책, 인덱스 자동 삭제)
drop table if exists public.ai_query_logs;
