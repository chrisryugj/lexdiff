import { describe, it, expect } from 'vitest'
import { findBestMST, detectFastPath, type LawEntry } from '@/lib/fc-rag/fast-path'

const e = (name: string, mst: string): LawEntry => ({ name, mst })

describe('findBestMST', () => {
  it('정확 매칭 우선', () => {
    const entries = [e('민법 시행령', '2'), e('민법', '1')]
    expect(findBestMST(entries, '민법 제103조')).toBe('1')
  })

  it('통칭 ≠ 정식명: 부분수열 유사매칭 ("인공지능법" → 인공지능기본법)', () => {
    const entries = [
      e('인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 [현행]', '282791'),
      e('인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령 [현행]', '282879'),
    ]
    expect(findBestMST(entries, '인공지능법 30조에 대해 쉽게 설명해줘')).toBe('282791')
  })

  it('무관한 검색 결과(쿼리 무시 응답)면 첫 항목을 집지 않고 null — full pipeline 폴백', () => {
    // 실사고: "인공지능법 30조" 검색에 법제처가 가나다순 무관 법령 50건 반환 →
    // 구 코드는 entries[0](가맹사업법)을 fast path로 내보냈음
    const junk = [
      e('가맹사업거래의 공정화에 관한 법률 [현행]', '268283'),
      e('간척지의 농어업적 이용 및 관리에 관한 법률 [현행]', '252833'),
      e('긴급복지지원법 [현행]', '270789'),
      e('도시철도법 [현행]', '258315'),
    ]
    expect(findBestMST(junk, '인공지능법 30조에 대해 쉽게 설명해줘')).toBeNull()
  })

  it('~령 법령명도 target으로 인식 (단일 결과)', () => {
    const entries = [e('지방공무원 임용령 [현행]', '9')]
    expect(findBestMST(entries, '지방공무원 임용령 3조')).toBe('9')
  })
})

describe('detectFastPath — 회귀 확인', () => {
  it('"인공지능법 30조에 대해 쉽게 설명해줘"는 article 패턴으로 감지', () => {
    const d = detectFastPath('인공지능법 30조에 대해 쉽게 설명해줘')
    expect(d.type).toBe('article_resolve')
    expect(d.lawName).toBe('인공지능법')
    expect(d.articles).toContain('제30조')
  })
})
