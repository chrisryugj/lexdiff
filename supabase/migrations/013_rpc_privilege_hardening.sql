-- 013: RPC 권한 강화 (보안 검토 2026-08-14)
--
-- 문제 1: Postgres는 CREATE FUNCTION 시 PUBLIC에 EXECUTE를 기본 부여하고,
--   Supabase 기본 default privileges는 anon/authenticated에도 EXECUTE를 부여한다.
--   기존 마이그레이션(003/007/008)의 `grant ... to service_role`은 추가 부여일 뿐
--   다른 롤을 제한하지 않으므로, SECURITY DEFINER인 쿼터 RPC가 PostgREST
--   /rest/v1/rpc/* 로 anon 키만으로 직접 호출 가능했다.
--   → decrement_quota 반복 호출 = 사전 차감 무한 환불(쿼터 우회),
--     increment_quota = 타인 uuid 지정 시 쿼터 소진 DoS.
--
-- 문제 2: handle_new_user_quota가 이메일 문자열 일치만으로 admin tier를
--   자동 부여 — 이메일 미검증 계정 선점 가입으로 admin 획득 여지.
--   admin 부여는 수동 UPDATE로 전환하고 트리거는 free 고정.

-- ── 1) 쿼터 RPC: service_role 전용으로 잠금 ──
revoke execute on function public.increment_quota(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.decrement_quota(uuid, text) from public, anon, authenticated;

-- ── 2) admin 자동 승격 제거: 신규 가입은 항상 free ──
-- (기존 admin 계정의 tier는 건드리지 않는다. 신규 admin은 수동 UPDATE:
--   update public.user_quota set tier = 'admin' where user_id = '<uuid>';)
create or replace function public.handle_new_user_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_quota (user_id, tier, counts, reset_at)
  values (new.id, 'free', '{}'::jsonb, (now() at time zone 'Asia/Seoul')::date)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- is_admin_email은 더 이상 트리거에서 사용하지 않음 — 개인 이메일 노출 제거
drop function if exists public.is_admin_email(text);
