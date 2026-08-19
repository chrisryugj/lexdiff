/**
 * 행정규칙명 분류 회귀 테스트
 *
 * 케이스는 법제처 admrul 목록 API 실측(1,282건) 중 종결어(고시·훈령·예규·지침)
 * 대상 408건에서 종전 패턴이 놓치던 18건을 그대로 옮긴 것이다.
 */

import { describe, it, expect } from 'vitest'
import { classifySearchQuery } from '@/src/domain/search/services/QueryClassifier'
import { isAdminRuleName } from '@/src/domain/patterns/LawPattern'

// 법제처 실측 행정규칙명 — 괄호·ㆍ(U+318D)·쉼표·물결·마침표·®·「」 포함
const REAL_ADMIN_RULES = [
  '관세청장이 인정하는 원산지(포괄)확인서 고시',
  '(경북지방우정청) 지도실장 관리 및 활동지침',
  '(군산지방해양수산청) 공용 차량 관리·운영 지침',
  '(부산지방항공청) 직무분류운영지침',
  '2020년 광해방지사업계획 변경(5차) 고시',
  '2024년~2026년 수도권 공장건축 총허용량 고시',
  '2026년 제품ㆍ포장재별 재활용의무율 고시',
  '3~5세 누리과정 고시',
  '6.25 비정규군 보상 및 정책발전 업무 훈령',
  '7ㆍ9급 채용후보자 임용 전 실무수습 업무처리 지침',
  'ENERGY STAR® Program 공인기관을 위한 지침',
  '「LPG연료 소매업」 생계형 적합업종 지정 고시',
  // 종전에도 통과하던 것 (회귀 감시)
  '징수업무 처리에 관한 고시',
  '국가공무원 복무·징계 관련 예규',
]

// admrul 로 오분류되면 안 되는 것들
const NOT_ADMIN_RULES = [
  '관세법',
  '민법 제750조',
  '건축법 시행규칙',
  '개인정보 보호법 시행령',
  '서울특별시 주차장 설치 및 관리 조례',
  '고시원 화재 시 임대인 책임은?',
  '이 고시가 언제 시행되는지 알려줘',
]

describe('행정규칙명 분류', () => {
  it.each(REAL_ADMIN_RULES)('isAdminRuleName: %s', (name) => {
    expect(isAdminRuleName(name)).toBe(true)
  })

  it.each(REAL_ADMIN_RULES)('classifySearchQuery → admrul: %s', (name) => {
    expect(classifySearchQuery(name).searchType).toBe('admrul')
  })

  it.each(NOT_ADMIN_RULES)('오분류 방지 — admrul 아님: %s', (name) => {
    expect(isAdminRuleName(name)).toBe(false)
    expect(classifySearchQuery(name).searchType).not.toBe('admrul')
  })
})
