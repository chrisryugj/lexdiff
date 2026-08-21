/**
 * BYOK 등록 UI 도달성 재현 테스트.
 *
 * 사용자 보고(2026-08-22, 김해 도서관 AX 교육 현장): "구글 로그인 상태라 API 등록이 안 되었다."
 *
 * API 키 입력창은 <AiGateDialog> 안에만 있고, 그 다이얼로그는 useAiGate 의 showGate 로만 열린다.
 * requireAuth 는 로그인 사용자면 즉시 action() 하고 반환하므로 showGate 가 켜질 일이 없다
 * → 로그인한 사용자에게는 키 등록 경로가 존재하지 않았다.
 *
 * 수정(2026-08-22): openGate() 로 통과 조건과 무관하게 열 수 있게 하고,
 * 계정 메뉴의 "API 키 등록" 이 force 이벤트로 이를 호출한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

const authState: { user: { id: string } | null } = { user: null }

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))

import { useAiGate } from "@/hooks/use-ai-gate"

beforeEach(() => {
  authState.user = null
  const store = new Map<string, string>()
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
})

describe("useAiGate — BYOK 등록 UI 도달성", () => {
  it("비로그인·키없음: 게이트가 열려 API 키를 등록할 수 있다 (기준선)", async () => {
    authState.user = null
    const { result } = renderHook(() => useAiGate())
    await waitFor(() => expect(result.current.ready).toBe(true))

    act(() => result.current.requireAuth(() => {}))

    expect(result.current.showGate).toBe(true)
  })

  it("로그인 상태: requireAuth는 통과만 시키고 게이트를 열지 않는다 (의도된 동작)", async () => {
    authState.user = { id: "user-1" }
    const { result } = renderHook(() => useAiGate())
    await waitFor(() => expect(result.current.user).not.toBeNull())

    let ranImmediately = false
    act(() => result.current.requireAuth(() => { ranImmediately = true }))

    expect({ ranImmediately, showGate: result.current.showGate })
      .toEqual({ ranImmediately: true, showGate: false })
  })

  it("로그인 상태: openGate로 API 키 등록 UI에 도달할 수 있다 (회귀 방지)", async () => {
    authState.user = { id: "user-1" }
    const { result } = renderHook(() => useAiGate())
    await waitFor(() => expect(result.current.user).not.toBeNull())

    act(() => result.current.openGate())

    expect(result.current.showGate).toBe(true)
  })

  it("BYOK 키 보유 상태에서도 openGate로 다시 열 수 있다 (키 교체·삭제 경로)", async () => {
    authState.user = null
    sessionStorage.setItem("lexdiff-gemini-api-key", "AIzaSy" + "a".repeat(33))
    const { result } = renderHook(() => useAiGate())
    await waitFor(() => expect(result.current.ready).toBe(true))

    act(() => result.current.requireAuth(() => {}))
    expect(result.current.showGate).toBe(false)

    act(() => result.current.openGate())
    expect(result.current.showGate).toBe(true)
  })
})
