/**
 * PatternDetector - 패턴 감지 서비스
 *
 * 판례, 재결례, 해석례 패턴 감지
 */

import {
  PRECEDENT_PATTERNS,
  COURT_NAMES,
  CASE_TYPES,
  normalizeCourt
} from '../../patterns/PrecedentPattern'
import { RULING_PATTERNS } from '../../patterns/RulingPattern'
import { INTERPRETATION_PATTERNS, RULE_TYPES } from '../../patterns/InterpretationPattern'

export interface PrecedentPatternResult {
  matched: boolean
  caseNumber?: string
  court?: string
}

export interface RulingPatternResult {
  matched: boolean
  rulingNumber?: string
}

export interface InterpretationPatternResult {
  matched: boolean
  interpretationType?: string
  ruleType?: string
}

/**
 * 판례 패턴 감지
 */
export function detectPrecedentPattern(query: string): PrecedentPatternResult {
  for (const pattern of PRECEDENT_PATTERNS) {
    const match = query.match(pattern)
    if (match) {
      const fullMatch = match[0]

      // 법원명 추출
      const courtPattern = new RegExp(`(${COURT_NAMES.join('|')})`)
      const courtMatch = fullMatch.match(courtPattern)
      const court = courtMatch ? normalizeCourt(courtMatch[0]) : undefined

      // 사건번호 추출 (공백 허용)
      const casePattern = new RegExp(`\\d{4}(${CASE_TYPES.join('|')})\\s*\\d+`)
      const caseMatch = fullMatch.match(casePattern)
      const caseNumber = caseMatch ? caseMatch[0].replace(/\s+/g, '') : undefined

      return { matched: true, caseNumber, court }
    }
  }
  return { matched: false }
}

/**
 * 재결례 패턴 감지
 */
export function detectRulingPattern(query: string): RulingPatternResult {
  for (const pattern of RULING_PATTERNS) {
    const match = query.match(pattern)
    if (match) {
      return { matched: true, rulingNumber: match[0] }
    }
  }
  return { matched: false }
}

/**
 * 해석례 패턴 감지
 */
export function detectInterpretationPattern(query: string): InterpretationPatternResult {
  for (const pattern of INTERPRETATION_PATTERNS) {
    const match = query.match(pattern)
    if (match) {
      const interpretationType = match[0]

      // 예규/고시/훈령 등 세부 타입 추출
      const ruleTypePattern = new RegExp(`(${RULE_TYPES.join('|')})`)
      const ruleTypeMatch = query.match(ruleTypePattern)
      const ruleType = ruleTypeMatch ? ruleTypeMatch[0] : undefined

      return { matched: true, interpretationType, ruleType }
    }
  }
  return { matched: false }
}

/**
 * 복합 쿼리 감지
 */
export function detectCompoundQuery(query: string): {
  isCompound: boolean
  types: string[]
} {
  const types: string[] = []

  const hasPrecedent = PRECEDENT_PATTERNS.some(p => p.test(query))
  const hasLaw = /법|령|규칙/.test(query)
  const hasInterpretation = INTERPRETATION_PATTERNS.some(p => p.test(query))

  if (hasPrecedent) types.push('precedent')
  if (hasLaw) types.push('law')
  if (hasInterpretation) types.push('interpretation')

  return {
    isCompound: types.length >= 2,
    types
  }
}
