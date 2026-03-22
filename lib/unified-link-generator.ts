/**
 * 통합 링크 생성 시스템 (메인 진입점)
 *
 * 목표:
 * 1. 모든 컴포넌트에서 동일한 링크 생성 규칙 사용
 * 2. 중복 처리 및 충돌 방지
 * 3. 테스트 가능한 구조
 *
 * 분리 구조:
 * - link-pattern-matchers.ts: 패턴 수집 함수 (collectXxxMatches)
 * - link-specialized.ts: 특화 함수 (linkifyRefsB, linkifyRefsAI, linkifyMarkdownLegalRefs)
 * - unified-link-generator.ts (이 파일): 메인 generateLinks + 공유 유틸 + re-exports
 */

import {
  collectSameLawMatches,
  collectQuotedLawMatches,
  collectUnquotedLawMatches,
  collectInternalArticleMatches,
  collectDecreeMatches,
  collectRuleMatches,
  collectAdminRuleMatches,
  collectAnnexMatches,
} from './link-pattern-matchers'

import {
  collectPrecedentMatches,
} from './link-specialized'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Re-exports: 기존 import 호환성 유지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { linkifyRefsB, linkifyRefsAI, linkifyMarkdownLegalRefs } from './link-specialized'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공유 타입 및 유틸 (패턴 매처/특화 함수에서 import)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LinkConfig {
  mode: 'safe' | 'aggressive'  // safe: 「」 있는 것만, aggressive: 모든 패턴
  enableSameRef?: boolean       // "같은 법" 패턴 활성화
  enableAdminRules?: boolean    // 행정규칙 링크 활성화
  enablePrecedents?: boolean    // 판례 링크 활성화
  currentLawName?: string       // 현재 보고 있는 법령명 (시행령에서 상위법 추론용)
}

export interface LinkMatch {
  start: number
  end: number
  type: 'law-quoted' | 'law-article' | 'law-name' | 'article' | 'decree' | 'rule' | 'same-law' | 'annex' | 'precedent'
  lawName?: string
  article?: string
  annexNumber?: string  // 별표 번호 (예: "1", "2의3")
  caseNumber?: string   // 판례 사건번호 (예: "91누13670")
  displayText: string
  html: string
}

/**
 * 법령명에서 타입 감지
 */
export function detectLawType(lawName: string): 'decree' | 'rule' | 'law' {
  if (/시행령/.test(lawName)) return 'decree'
  if (/시행규칙/.test(lawName)) return 'rule'
  return 'law'
}

/**
 * 접근성: 링크 타입별 aria-label 생성
 */
export function getAriaLabel(type: string, lawName?: string, article?: string, annexNumber?: string, caseNumber?: string): string {
  const labels: Record<string, string> = {
    'law-quoted': '법령 참조',
    'law-article': '법령 조문 참조',
    'law-name': '법령 참조',
    'article': '조문 이동',
    'same-law': '같은 법 조문 참조',
    'decree': '시행령 참조',
    'rule': '시행규칙 참조',
    'regulation': '행정규칙 참조',
    'annex': '별표 보기',
    'precedent': '판례 보기',
  }
  const baseLabel = labels[type] || '법령 참조'
  if (caseNumber) return `${caseNumber} ${baseLabel}`
  if (annexNumber) return `별표 ${annexNumber} ${baseLabel}`
  if (lawName && article) return `${lawName} ${article} ${baseLabel}`
  if (lawName) return `${lawName} ${baseLabel}`
  if (article) return `${article} ${baseLabel}`
  return baseLabel
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 파이프라인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 통합 링크 생성 함수
 */
export function generateLinks(text: string, config: LinkConfig = { mode: 'safe' }): string {
  const matches: LinkMatch[] = []

  // 1단계: 모든 매칭 수집
  // CRITICAL: 내부 조문 참조를 가장 먼저 수집 (우선권)
  collectInternalArticleMatches(text, matches)

  if (config.enableSameRef) {
    collectSameLawMatches(text, matches, config.currentLawName)
  }

  collectQuotedLawMatches(text, matches)

  if (config.mode === 'aggressive') {
    collectUnquotedLawMatches(text, matches)
  }

  collectDecreeMatches(text, matches)
  collectRuleMatches(text, matches)

  if (config.enableAdminRules) {
    collectAdminRuleMatches(text, matches)
  }

  // 별표 패턴 수집 (항상 활성화)
  collectAnnexMatches(text, matches)

  // 판례 패턴 수집 (옵션)
  if (config.enablePrecedents) {
    collectPrecedentMatches(text, matches)
  }

  // DEBUG: 매칭 결과 로깅
  // 2단계: 충돌 해결 (위치 기반 중복 제거)
  const resolvedMatches = resolveConflicts(matches)

  // 3단계: HTML 생성
  return buildHtml(text, resolvedMatches)
}

/**
 * 충돌 해결 (겹치는 매칭 제거)
 */
function resolveConflicts(matches: LinkMatch[]): LinkMatch[] {
  // 시작 위치로 정렬
  matches.sort((a, b) => a.start - b.start)

  const resolved: LinkMatch[] = []
  let lastEnd = 0

  for (const match of matches) {
    // 이전 매칭과 겹치지 않는 경우만 추가
    if (match.start >= lastEnd) {
      resolved.push(match)
      lastEnd = match.end
    } else {
      // 겹치는 경우 우선순위 판단
      const lastMatch = resolved[resolved.length - 1]

      // 우선순위: law-quoted > law-article > others
      const priority: Record<string, number> = {
        'law-quoted': 100,
        'same-law': 90,
        'precedent': 85,
        'law-article': 80,
        'law-name': 70,
        'annex': 65,
        'article': 60,
        'decree': 50,
        'rule': 40
      }

      if (priority[match.type] > priority[lastMatch.type]) {
        // 새 매칭이 우선순위가 높으면 교체
        resolved[resolved.length - 1] = match
        lastEnd = match.end
      }
    }
  }

  return resolved
}

/**
 * 최종 HTML 생성
 */
function buildHtml(text: string, matches: LinkMatch[]): string {
  if (matches.length === 0) {
    return text
  }

  let result = ''
  let lastPos = 0

  for (const match of matches) {
    // 매칭 이전 텍스트
    result += text.slice(lastPos, match.start)
    // 링크 HTML
    result += match.html
    lastPos = match.end
  }

  // 마지막 텍스트
  result += text.slice(lastPos)

  return result
}
