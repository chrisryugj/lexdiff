-- 007: 쿼터 보상(rollback) RPC
--
-- 목적: `requireAiAuth`가 쿼터를 선차감했으나 AI 엔진이 최종적으로 응답 생성에
-- 실패했을 때, 사용자가 헛되이 한 건을 잃지 않도록 카운트를 1 되돌린다.
--
-- 규칙:
--   - 카운트는 0 아래로 내려가지 않는다 (언더플로우 방지)
--   - 일일 리셋 경계를 넘은 경우(reset_at이 오늘 이전)엔 아무 일도 하지 않는다
--     (이미 자정에 초기화되었으므로 현재 카운트는 오늘치 — 이전 요청의 차감분이 아님)
--   - admin 티어도 카운트는 관측용으로 증가시키므로 동일하게 감소시킴
--   - FOR UPDATE 락으로 increment_quota와 순차 처리 보장

create or replace function public.decrement_quota(
  p_user_id uuid,
  p_feature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_quota%rowtype;
  v_current int;
  v_next int;
begin
  select * into v_row from public.user_quota where user_id = p_user_id for update;

  if not found then
    return jsonb_build_object('refunded', false, 'reason', 'no_row');
  end if;

  -- 리셋 경계를 넘었다면 보상 대상 없음
  if v_row.reset_at < current_date then
    return jsonb_build_object('refunded', false, 'reason', 'reset_boundary');
  end if;

  v_current := coalesce((v_row.counts ->> p_feature)::int, 0);
  if v_current <= 0 then
    return jsonb_build_object('refunded', false, 'reason', 'zero');
  end if;

  v_next := v_current - 1;
  v_row.counts := jsonb_set(v_row.counts, array[p_feature], to_jsonb(v_next), true);

  update public.user_quota
    set counts = v_row.counts, updated_at = now()
    where user_id = p_user_id;

  return jsonb_build_object(
    'refunded', true,
    'current', v_next,
    'feature', p_feature
  );
end;
$$;

grant execute on function public.decrement_quota(uuid, text) to service_role;
