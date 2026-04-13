import { describe, it, expect } from 'vitest'
import { compressDecisionText } from '@/lib/fc-rag/tool-cache'

describe('compressDecisionText', () => {
  it('섹션 마커가 없으면 원본 반환 (안전 폴백)', () => {
    const input = '이것은 그냥 텍스트입니다. 섹션 마커 없음.'
    expect(compressDecisionText(input)).toBe(input)
  })

  it('판시사항은 절대 잘리지 않음 (공식 요약 보호)', () => {
    const headnote = '매우 긴 판시사항 내용입니다. '.repeat(200) // ~5K chars
    const input = `=== 대법원 2020도1234 판결 ===

기본 정보:
  사건번호: 2020도1234

판시사항:
${headnote}

판결요지:
짧은 요지.
`
    const out = compressDecisionText(input)
    expect(out).toContain(headnote.trim())
  })

  it('판결요지도 절대 잘리지 않음', () => {
    const summary = '매우 긴 판결요지 내용입니다. '.repeat(200)
    const input = `=== 판례 ===

판시사항:
핵심 판시.

판결요지:
${summary}

전문:
짧은 전문.
`
    const out = compressDecisionText(input)
    expect(out).toContain(summary.trim())
  })

  it('전문은 자연 경계(단락)에서 자름 — 문장 중간 X', () => {
    // 판시사항 있음 → 전문은 1200자 목표
    const para1 = '첫 번째 단락입니다. '.repeat(30) // ~600
    const para2 = '두 번째 단락입니다. '.repeat(30) // ~600
    const para3 = '세 번째 단락입니다. '.repeat(60) // ~1200, 이건 목표 초과라 잘림 대상
    const input = `=== 판례 ===

판시사항:
요약.

전문:
${para1}

${para2}

${para3}
`
    const out = compressDecisionText(input)
    // 전문이 잘렸으면 truncation 마커 존재
    expect(out).toContain('⚠️')
    // 문장이 "입니다. " 로 끝나야 하고, 중간 "입니" 이런 식으로 끝나면 안 됨
    const truncMarkerIdx = out.indexOf('⚠️')
    const beforeMarker = out.slice(0, truncMarkerIdx).trimEnd()
    // 마지막 문자가 한국어 문장 종결 or 단락 끝이어야 함
    const lastChar = beforeMarker.slice(-1)
    expect(['.', '다', '요', '임', '함', '음', '\n']).toContain(lastChar === '\n' ? '\n' : (beforeMarker.endsWith('다.') || beforeMarker.endsWith('. ') || beforeMarker.endsWith('.')) ? '.' : lastChar)
  })

  it('판시사항 없으면 전문을 더 길게 유지 (3000자 목표)', () => {
    const longFulltext = '전문 문장입니다. '.repeat(200) // ~3.4K
    const input = `=== 판례 ===

기본 정보:
  사건번호: XYZ

전문:
${longFulltext}
`
    const out = compressDecisionText(input)
    // 판시사항 없음 → 더 많이 유지됨 (1200 목표가 아님)
    const fulltextSectionIdx = out.indexOf('전문:\n')
    expect(fulltextSectionIdx).toBeGreaterThan(-1)
    const fulltextPart = out.slice(fulltextSectionIdx)
    // 최소 1500자 이상은 유지되어야 함 (3000 목표의 절반 이상)
    expect(fulltextPart.length).toBeGreaterThan(1500)
  })

  it('참조판례는 500자 목표로 자연 경계 자름', () => {
    const refcases = '참조판례 내용입니다. '.repeat(100)
    const input = `=== 판례 ===

판시사항:
짧음.

참조판례:
${refcases}

전문:
짧은 전문.
`
    const out = compressDecisionText(input)
    expect(out).toContain('참조판례 일부 생략')
  })

  it('짧은 전문은 원본 유지 (truncation 마커 없음)', () => {
    const input = `=== 판례 ===

판시사항:
핵심.

전문:
짧은 전문. 여기서 끝.
`
    const out = compressDecisionText(input)
    expect(out).not.toContain('⚠️')
    expect(out).toContain('짧은 전문. 여기서 끝.')
  })

  it('truncation 마커에 "인용 금지" 문구 포함 — LLM 할루시네이션 방지', () => {
    const longText = '가나다라마바사. '.repeat(500)
    const input = `=== 판례 ===

판시사항:
요약.

전문:
${longText}
`
    const out = compressDecisionText(input)
    expect(out).toContain('⚠️')
    expect(out).toMatch(/인용 시 위 내용만/)
  })
})
