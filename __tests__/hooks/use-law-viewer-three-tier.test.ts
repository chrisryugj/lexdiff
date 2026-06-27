/**
 * useLawViewerThreeTier 위임법령 빈 탭 자동 전환 테스트 (DELEG-1)
 *
 * 위임법령 패널을 열었을 때 기본 탭(시행령)이 비어 있으면 내용 있는 탭으로 1회 자동 전환.
 * 잔여분: 시행령·시행규칙이 모두 비고 행정규칙만 위임된 조문은 admin 탭으로 전환하되,
 * 행정규칙은 별도 비동기 훅이 로드하므로 로드 완료 전이면 전환을 보류한다(경합 방지).
 */

import { describe, it, expect, beforeAll, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useLawViewerThreeTier } from "@/hooks/use-law-viewer-three-tier"
import type { LawMeta } from "@/lib/law-types"

// 훅이 마운트 시 패널 크기를 localStorage에서 읽으므로 인메모리 스텁 제공
beforeAll(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
})

const meta: LawMeta = { lawTitle: "테스트법", fetchedAt: "2026-06-27T00:00:00.000Z" }

describe("useLawViewerThreeTier — DELEG-1 빈 탭 자동 전환", () => {
  it("시행령·시행규칙 모두 비고 행정규칙만 로드돼 있으면 admin 탭으로 전환", () => {
    const { result } = renderHook(() =>
      useLawViewerThreeTier(meta, "000100", undefined, false, false, /* hasLoadedAdminContent */ true),
    )

    // 기본 탭은 시행령(decree)
    expect(result.current.delegationActiveTab).toBe("decree")

    act(() => {
      result.current.setTierViewMode("2-tier")
    })

    // 시행령/시행규칙 비어 있고 행정규칙만 로드 → admin 탭
    expect(result.current.delegationActiveTab).toBe("admin")
  })

  it("행정규칙도 로드되지 않았으면 전환하지 않고 시행령 탭 유지(가드 미설정)", () => {
    const { result } = renderHook(() =>
      useLawViewerThreeTier(meta, "000100", undefined, false, false, /* hasLoadedAdminContent */ false),
    )

    act(() => {
      result.current.setTierViewMode("2-tier")
    })

    expect(result.current.delegationActiveTab).toBe("decree")
  })

  it("행정규칙 로드 전엔 대기하다 로드 완료(rerender) 시 admin으로 전환 (경합 방지)", () => {
    const { result, rerender } = renderHook(
      ({ adminLoaded }: { adminLoaded: boolean }) =>
        useLawViewerThreeTier(meta, "000100", undefined, false, false, adminLoaded),
      { initialProps: { adminLoaded: false } },
    )

    act(() => {
      result.current.setTierViewMode("2-tier")
    })

    // 아직 행정규칙 로드 전 → 전환 보류, 시행령 탭 유지
    expect(result.current.delegationActiveTab).toBe("decree")

    // 행정규칙 로드 완료
    rerender({ adminLoaded: true })

    expect(result.current.delegationActiveTab).toBe("admin")
  })

  it("패널을 닫으면(1-tier) 활성 탭이 decree로 리셋돼 다음 오픈에서 재평가된다 (회귀 방지)", () => {
    const { result } = renderHook(() =>
      useLawViewerThreeTier(meta, "000100", undefined, false, false, true),
    )

    act(() => {
      result.current.setTierViewMode("2-tier")
    })
    expect(result.current.delegationActiveTab).toBe("admin")

    // 패널 닫기 → 활성 탭이 decree로 리셋(가드 무력화 방지)
    act(() => {
      result.current.setTierViewMode("1-tier")
    })
    expect(result.current.delegationActiveTab).toBe("decree")

    // 재오픈 → 다시 admin으로 자동전환 (1회 전환 뒤 무력화되지 않음)
    act(() => {
      result.current.setTierViewMode("2-tier")
    })
    expect(result.current.delegationActiveTab).toBe("admin")
  })
})
