/**
 * SearchType - 검색 타입 정의
 *
 * 7가지 검색 타입과 관련 유틸리티 함수
 */

// 기본 쿼리 타입 (구조화 vs 자연어)
export type QueryType = 'structured' | 'natural'

// 검색 모드 (레거시 호환)
export type SearchMode = 'law' | 'ordinance' | 'ai'

// 7가지 검색 타입
export type SearchType =
  | 'law'           // 법령
  | 'ordinance'     // 조례
  | 'ai'            // AI 자연어 검색
  | 'precedent'     // 판례
  | 'interpretation' // 해석례
  | 'ruling'        // 재결례
  | 'multi'         // 복합 검색

// SearchType → SearchMode 매핑 (레거시 호환)
export function toSearchMode(searchType: SearchType): SearchMode {
  switch (searchType) {
    case 'law':
      return 'law'
    case 'ordinance':
      return 'ordinance'
    case 'ai':
    case 'precedent':
    case 'interpretation':
    case 'ruling':
    case 'multi':
      return 'ai'
    default:
      return 'law'
  }
}

// 검색 타입이 법령 관련인지 확인
export function isLawRelated(searchType: SearchType): boolean {
  return searchType === 'law' || searchType === 'ordinance'
}

// 검색 타입이 AI 관련인지 확인
export function isAiRelated(searchType: SearchType): boolean {
  return searchType === 'ai'
}

// 검색 타입이 판례/해석례/재결례인지 확인
export function isCaseLaw(searchType: SearchType): boolean {
  return searchType === 'precedent' || searchType === 'interpretation' || searchType === 'ruling'
}
