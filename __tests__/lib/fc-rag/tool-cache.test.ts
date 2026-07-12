/**
 * tool-cache 압축 유틸 테스트.
 *
 * compressSearchResult: korean-law-mcp search_law 원본 포맷 압축 +
 * mcp 4.7+ 시행예정 병기(🔜) 보존 (신법 "법령 없음" 오판 방지 정보).
 */

import { describe, expect, it } from 'vitest'
import { compressSearchResult } from '@/lib/fc-rag/tool-cache'

const RAW = `검색 결과 (총 2건):

📍 정확매칭 (1건):

1. 도로교통법 [현행]
   - 법령ID: 001737
   - MST: 279534
   - 공포일: 20250320 / 시행일: 20260701
   - 구분: 법률

📂 부분매칭 (1건):

2. 도로교통법 시행령 [현행]
   - 법령ID: 001738
   - MST: 279535
   - 공포일: 20250320
   - 구분: 대통령령
`

describe('compressSearchResult', () => {
  it('원본 포맷을 컴팩트 라인으로 압축한다', () => {
    const out = compressSearchResult(RAW)
    expect(out).toContain('검색 결과 (총 2건):')
    expect(out).toContain('1. 도로교통법 [현행] (MST:279534, 법률)')
    expect(out).toContain('2. 도로교통법 시행령 [현행] (MST:279535, 대통령령)')
    expect(out).not.toContain('법령ID')
  })

  it('확장쿼리 병기 헤더도 보존한다 (mcp 확장검색)', () => {
    const text = RAW.replace('검색 결과 (총 2건):', '검색 결과 (총 2건, 확장쿼리: "AI법"):')
    const out = compressSearchResult(text)
    expect(out).toContain('확장쿼리: "AI법"')
  })

  it('mcp 4.7+ 시행예정 병기(🔜 라인)를 압축 후에도 보존한다', () => {
    const text = RAW +
      '\n🔜 제명변경 예정: 「구법명」 → 「신법명」 (일부개정, 2026.06.01. 공포 제20000호, 시행 2026.09.01.) — 시행예정본 조문: get_law_text(mst="123456", efYd="20260901")\n'
    const out = compressSearchResult(text)
    expect(out).toContain('🔜 제명변경 예정')
    expect(out).toContain('efYd="20260901"')
    // 압축은 유지
    expect(out).not.toContain('법령ID')
  })

  it('목록 포맷이 아니면 원문을 그대로 통과시킨다 (0건·FALLBACK 등)', () => {
    const text = '[FALLBACK] 법령 \'광진구 조례\' 0건 → 자치법규로 자동 폴백.\n[2098841] 서울특별시 광진구 도시계획 조례'
    expect(compressSearchResult(text)).toBe(text)
  })
})
