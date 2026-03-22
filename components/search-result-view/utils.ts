/**
 * search-result-view/utils.ts
 *
 * 검색 결과 화면 유틸리티 함수
 */

// ============================================================
// 법령 타입별 Badge 색상 클래스
// ============================================================

export function getLawTypeBadgeClass(lawType: string): string {
  const normalizedType = lawType.toLowerCase()

  if (normalizedType.includes('법률')) {
    return 'bg-[#d4af37]/10 text-[#b5952f] dark:bg-[#e2a85d]/10 dark:text-[#e2a85d] border border-[#d4af37]/20 dark:border-[#e2a85d]/30'
  } else if (normalizedType.includes('시행령') || normalizedType.includes('대통령령')) {
    return 'bg-[#1a2b4c]/10 text-[#1a2b4c] dark:bg-muted dark:text-muted-foreground border border-[#1a2b4c]/20 dark:border-border'
  } else if (normalizedType.includes('시행규칙') || normalizedType.includes('총리령') || normalizedType.includes('부령')) {
    return 'bg-muted text-muted-foreground border border-border'
  } else {
    return 'bg-secondary text-secondary-foreground'
  }
}

// ============================================================
// 검색어 키워드 판별
// ============================================================

export function hasLawKeyword(query: string): boolean {
  return /법|법률|시행령|시행규칙|규정/.test(query)
}

export function hasOrdinanceKeyword(query: string): boolean {
  // "조레"는 "조례"의 흔한 오타
  // 주의: "규칙" 단독은 행정규칙일 수 있으므로 조례 판별에서 제외
  return /조례|조레|자치법규/.test(query)
}

export function hasAdminRuleKeyword(query: string): boolean {
  // 시행규칙은 법령이므로 제외
  if (/시행규칙/.test(query)) return false
  return /훈령|예규|고시|지침/.test(query)
}

import { containsLocalGovName } from '@/src/domain/patterns/OrdinancePattern'
export { containsLocalGovName }

export function isOrdinanceQuery(query: string): boolean {
  // 행정규칙 키워드가 있으면 조례가 아님
  if (hasAdminRuleKeyword(query)) return false
  // 명시적 조례 키워드
  if (hasOrdinanceKeyword(query) && !hasLawKeyword(query)) return true
  // 지역명 포함 + 법령 키워드 없음 → 조례 가능성
  if (containsLocalGovName(query) && !hasLawKeyword(query)) return true
  return false
}

// ============================================================
// 검색 쿼리 정규화
// ============================================================

export function buildFullQuery(lawName: string, article?: string): string {
  return article ? `${lawName} ${article}` : lawName
}

