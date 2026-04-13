-- 003: 사용자별 AI 기능 쿼터
--
-- features: fc_rag, summarize, benchmark, impact
-- counts는 일일 자정(KST 기준 UTC+9)에 reset_at < CURRENT_DATE 비교로 자동 초기화.
-- 티어는 free / pro / admin (admin은 무제한, 코드에서 분기).

create table if not exists public.user_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',
  counts jsonb not null default '{}'::jsonb,
  reset_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_quota_tier on public.user_quota(tier);

-- RLS: 본인 행 read만, write는 service_role만
alter table public.user_quota enable row level security;

drop policy if exists "user_quota_select_own" on public.user_quota;
create policy "user_quota_select_own"
  on public.user_quota
  for select
  using (auth.uid() = user_id);

-- 관리자 이메일 화이트리스트 (admin tier 자동 부여)
create or replace function public.is_admin_email(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email = any (array['ryuseungin@gmail.com']);
$$;

-- 신규 가입 시 자동 행 생성
create or replace function public.handle_new_user_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
begin
  v_tier := case when public.is_admin_email(new.email) then 'admin' else 'free' end;
  insert into public.user_quota (user_id, tier, counts, reset_at)
  values (new.id, v_tier, '{}'::jsonb, current_date)
  on conflict (user_id) do update set tier = excluded.tier;
  return new;
end;
$$;

-- 기존 유저(마이그레이션 시점) 중 관리자 이메일 보정
do $$
begin
  insert into public.user_quota (user_id, tier, counts, reset_at)
  select u.id, 'admin', '{}'::jsonb, current_date
    from auth.users u
   where public.is_admin_email(u.email)
  on conflict (user_id) do update set tier = 'admin';
end $$;

drop trigger if exists on_auth_user_created_quota on auth.users;
create trigger on_auth_user_created_quota
  after insert on auth.users
  for each row execute function public.handle_new_user_quota();

-- 원자적 증가 + 일일 리셋 RPC
-- 반환: { allowed: bool, current: int, limit: int, reset_at: date }
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
begin
  -- 행이 없으면 생성
  insert into public.user_quota (user_id, tier, counts, reset_at)
  values (p_user_id, 'free', '{}'::jsonb, current_date)
  on conflict (user_id) do nothing;

  select * into v_row from public.user_quota where user_id = p_user_id for update;

  -- 일일 리셋
  if v_row.reset_at < current_date then
    v_row.counts := '{}'::jsonb;
    v_row.reset_at := current_date;
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
    -- reset_at만 동기화하고 카운트는 그대로
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

grant execute on function public.increment_quota(uuid, text, int) to service_role;
