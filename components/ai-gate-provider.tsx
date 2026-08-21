'use client'

import { useEffect, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useAiGate } from '@/hooks/use-ai-gate'
import { debugLogger } from '@/lib/debug-logger'

const AiGateDialog = dynamic(
  () => import('@/components/ai-gate-dialog').then(m => m.AiGateDialog),
  { ssr: false }
)

/**
 * 전역 AI 인증 게이트.
 *
 * 모든 AI 기능 컴포넌트는 401 응답을 받을 때
 * `window.dispatchEvent(new CustomEvent('lexdiff:ai-gate-required', { detail: { query?, onSuccess? } }))`
 * 를 쏘기만 하면 여기서 다이얼로그를 띄워준다.
 *
 * `detail.force`를 주면 로그인/키 보유와 무관하게 다이얼로그를 연다 (API 키 등록 진입).
 *
 * OAuth 리디렉션을 대비해 `query`는 sessionStorage에 저장 —
 * 검색 화면이 pending query를 자동 재실행한다.
 */
export function AiGateProvider({ children }: { children: ReactNode }) {
  const { user, showGate, requireAuth, openGate, handleClose, handleKeySaved } = useAiGate()

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { query?: string; returnView?: unknown; onSuccess?: () => void; force?: boolean }
        | undefined

      // 명시적 진입(계정 메뉴 → API 키 등록)은 통과 조건을 건너뛰고 바로 연다
      if (detail?.force) {
        openGate()
        return
      }

      // OAuth 리디렉션 대비 복귀 정보 스냅샷 저장
      if (detail?.query) {
        try { sessionStorage.setItem('lexdiff:pending-ai-query', detail.query) } catch { /* ignore */ }
      }
      if (detail?.returnView) {
        try { sessionStorage.setItem('lexdiff:pending-view', JSON.stringify(detail.returnView)) } catch { /* ignore */ }
      }

      requireAuth(() => {
        try {
          sessionStorage.removeItem('lexdiff:pending-ai-query')
          sessionStorage.removeItem('lexdiff:pending-view')
        } catch { /* ignore */ }
        detail?.onSuccess?.()
      })
    }
    window.addEventListener('lexdiff:ai-gate-required', handler)
    debugLogger.info('[AiGateProvider] 전역 게이트 리스너 등록')
    return () => window.removeEventListener('lexdiff:ai-gate-required', handler)
  }, [requireAuth, openGate])

  return (
    <>
      {children}
      <AiGateDialog open={showGate} isLoggedIn={!!user} onClose={handleClose} onKeySaved={handleKeySaved} />
    </>
  )
}
