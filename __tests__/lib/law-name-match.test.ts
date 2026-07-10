import { describe, it, expect } from 'vitest'
import { isNameSubsequence, stripLawSuffix, scoreLawNameMatch } from '@/lib/law-name-match'
import { calculateSimilarity } from '@/lib/text-similarity'

describe('stripLawSuffix', () => {
  it('법/시행령/시행규칙 어미를 뗀다', () => {
    expect(stripLawSuffix('인공지능법')).toBe('인공지능')
    expect(stripLawSuffix('도로교통법 시행령')).toBe('도로교통법시행령'.replace(/시행령$/, ''))
    expect(stripLawSuffix('중대재해처벌법')).toBe('중대재해처벌')
  })
})

describe('isNameSubsequence', () => {
  it('순서 보존 부분수열을 인식한다', () => {
    expect(isNameSubsequence('인공지능법', '인공지능기본법')).toBe(true)
    expect(isNameSubsequence('인공지능법', '인공지능발전과신뢰기반조성등에관한기본법')).toBe(true)
    expect(isNameSubsequence('인공지능법', '데이터기반행정활성화에관한법률')).toBe(false)
  })
})

describe('scoreLawNameMatch', () => {
  it('정식명/약칭 완전일치는 1000점', () => {
    expect(scoreLawNameMatch('인공지능기본법', '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법', '인공지능기본법')).toBe(1000)
  })

  it('비공식 약칭은 공식 약칭 부분수열로 고득점', () => {
    const aiBasic = scoreLawNameMatch('인공지능법', '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법', '인공지능기본법')
    const industrial = scoreLawNameMatch('인공지능법', '산업 디지털 전환 및 인공지능 활용 촉진법', '산업디지털전환법')
    const unrelated = scoreLawNameMatch('인공지능법', '데이터기반행정 활성화에 관한 법률', '데이터기반행정법')
    expect(aiBasic).toBeGreaterThan(industrial)
    expect(industrial).toBeGreaterThan(0)
    expect(unrelated).toBe(0)
  })

  it('본법이 시행령보다 높다', () => {
    const main = scoreLawNameMatch('인공지능법', '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법', '인공지능기본법')
    const decree = scoreLawNameMatch('인공지능법', '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령', '인공지능기본법 시행령')
    expect(main).toBeGreaterThan(decree)
  })
})

describe('클라이언트 유사도 통합 (useBasicSearch 자동 선택 경로)', () => {
  it('"인공지능법"과 공식 약칭 "인공지능기본법"의 유사도가 0.6 이상 — 자동 선택된다', () => {
    expect(calculateSimilarity('인공지능법', '인공지능기본법')).toBeGreaterThanOrEqual(0.6)
  })
})
