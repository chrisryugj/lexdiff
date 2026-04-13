'use client'

import { useState, useCallback, useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { User } from '@supabase/supabase-js'

/**
 * AI 기능 게이트 훅.
 *
 * - Supabase 세션이 있으면 → 즉시 통과 (쿼터는 서버에서 차감)
 * - 세션 없으면 → 로그인 다이얼로그 띄우고 로그인 후 액션 재실행
 * - 본인 API 키(useApiKey)가 등록돼있으면 → 로그인 없이도 통과 (서버가 BYOK 헤더 감지)
 */
export function useAiGate() {
  const [user, setUser] = useState<User | null>(null)
  const [showGate, setShowGate] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 세션이 막 생긴 직후 pending 액션 자동 실행
  useEffect(() => {
    if (user && pendingAction) {
      const action = pendingAction
      setPendingAction(null)
      setShowGate(false)
      action()
    }
  }, [user, pendingAction])

  const hasByokKey = useCallback((): boolean => {
    try {
      return !!sessionStorage.getItem('lexdiff-gemini-api-key')
    } catch {
      return false
    }
  }, [])

  const requireAuth = useCallback((action: () => void) => {
    if (user || hasByokKey()) {
      action()
      return
    }
    setPendingAction(() => action)
    setShowGate(true)
  }, [user, hasByokKey])

  const handleClose = useCallback(() => {
    setShowGate(false)
    setPendingAction(null)
  }, [])

  return {
    user,
    ready,
    showGate,
    requireAuth,
    handleClose,
  }
}
