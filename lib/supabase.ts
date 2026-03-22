import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Supabase 클라이언트 싱글턴.
 * 환경변수 없으면 null 반환 — 관계 그래프 기능이 graceful하게 비활성화됨.
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  _client = createClient(url, key)
  return _client
}

/**
 * Supabase 사용 가능 여부 (환경변수 설정 확인)
 */
export function isSupabaseAvailable(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
}
