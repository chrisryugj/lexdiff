-- 008: 쿼터 일일 리셋을 한국 시간(KST) 자정 기준으로 변경
--
-- 배경:
--   003/007 에서는 `current_date` 를 비교에 썼는데, Supabase Postgres 기본
--   timezone 이 UTC 이므로 "UTC 자정 = KST 오전 09:00" 에 리셋이 발생했다.
--   003 의 주석에는 "KST 자정" 이라 적혀 있어 의도와 구현이 불일치했던 상태.
--
-- 수정:
--   - 모든 `current_date` 기반 판단을 `(now() AT TIME ZONE 'Asia/Seoul')::date`
--     로 교체하여 한국 시각 자정(00:00 KST)에 정확히 리셋되게 한다.
--   - handle_new_user_quota 의 reset_at 초기값도 KST 날짜로 설정.
--   - increment_quota / decrement_quota 두 함수를 CREATE OR REPLACE 로 재정의.
--
-- 주의:
--   reset_at 컬럼은 여전히 date 타입이며, 저장되는 값은 "KST 기준 날짜" 로 해석한다.
--   기존 행의 reset_at 은 그대로 둬도, 다음 요청에서 KST 오늘과 비교해 한 번
--   자연스럽게 초기화된다 (최대 1일 과차감 가능성만 있음 — 허용 범위).

create or replace function public.handle_new_user_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  v_tier := case when public.is_admin_email(new.email) then 'admin' else 'free' end;
  insert into public.user_quota (user_id, tier, counts, reset_at)
  values (new.id, v_tier, '{}'::jsonb, v_today)
  on conflict (user_id) do update set tier = excluded.tier;
  return new;
end;
$$;

create or replace function public.increment_quota(
  p_user_id uuid,
  p_feature text,
  p_limit int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_quota%rowtype;
  v_current int;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  -- 행이 없으면 생성 (reset_at 은 KST 오늘)
  insert into public.user_quota (user_id, tier, counts, reset_at)
  values (p_user_id, 'free', '{}'::jsonb, v_today)
  on conflict (user_id) do nothing;

  select * into v_row from public.user_quota where user_id = p_user_id for update;

  -- 일일 리셋 (KST 기준)
  if v_row.reset_at < v_today then
    v_row.counts := '{}'::jsonb;
    v_row.reset_at := v_today;
  end if;

  v_current := coalesce((v_row.counts ->> p_feature)::int, 0);

  -- admin은 항상 허용 (limit 무시)
  if v_row.tier = 'admin' then
    v_row.counts := jsonb_set(v_row.counts, array[p_feature], to_jsonb(v_current + 1), true);
    update public.user_quota
      set counts = v_row.counts, reset_at = v_row.reset_at, updated_at = now()
      where user_id = p_user_id;
    return jsonb_build_object(
      'allowed', true,
      'current', v_current + 1,
      'limit', -1,
      'reset_at', v_row.reset_at
    );
  end if;

  if v_current >= p_limit then
    update public.user_quota
      set counts = v_row.counts, reset_at = v_row.reset_at, updated_at = now()
      where user_id = p_user_id;
    return jsonb_build_object(
      'allowed', false,
      'current', v_current,
      'limit', p_limit,
      'reset_at', v_row.reset_at
    );
  end if;

  v_row.counts := jsonb_set(v_row.counts, array[p_feature], to_jsonb(v_current + 1), true);
  update public.user_quota
    set counts = v_row.counts, reset_at = v_row.reset_at, updated_at = now()
    where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'current', v_current + 1,
    'limit', p_limit,
    'reset_at', v_row.reset_at
  );
end;
$$;

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
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into v_row from public.user_quota where user_id = p_user_id for update;

  if not found then
    return jsonb_build_object('refunded', false, 'reason', 'no_row');
  end if;

  -- KST 리셋 경계를 넘었다면 보상 대상 없음
  if v_row.reset_at < v_today then
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

grant execute on function public.increment_quota(uuid, text, int) to service_role;
grant execute on function public.decrement_quota(uuid, text) to service_role;
