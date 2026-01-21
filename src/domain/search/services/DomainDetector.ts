/**
 * DomainDetector - 도메인 감지 서비스
 *
 * 쿼리에서 법률 도메인(관세/행정/공무원/세금)을 감지
 */

import type { LegalDomain } from '../value-objects/LegalDomain'
import {
  CUSTOMS_DOMAIN,
  ADMINISTRATIVE_DOMAIN,
  CIVIL_SERVICE_DOMAIN,
  TAX_DOMAIN
} from '../../patterns/DomainKeywords'

export interface DomainDetectionResult {
  domain: LegalDomain
  confidence: number
  matchedTerms: string[]
}

/**
 * 도메인 감지
 * 가중치: 법령명 0.5, 엔티티 0.05
 */
export function detectDomain(
  query: string,
  extractedLaws: string[]
): DomainDetectionResult {
  const matchedTerms: string[] = []
  const domainScores: Record<LegalDomain, number> = {
    customs: 0,
    administrative: 0,
    'civil-service': 0,
    tax: 0,
    general: 0
  }

  // 1. 법령명으로 도메인 판단 (가장 강력한 신호)
  for (const law of extractedLaws) {
    if (CUSTOMS_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores.customs += 0.5
      matchedTerms.push(law)
    }
    if (ADMINISTRATIVE_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores.administrative += 0.5
      matchedTerms.push(law)
    }
    if (CIVIL_SERVICE_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores['civil-service'] += 0.5
      matchedTerms.push(law)
    }
    if (TAX_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores.tax += 0.5
      matchedTerms.push(law)
    }
  }

  // 2. 엔티티로 도메인 판단 (가중치 0.05)
  const normalizedQuery = query.toLowerCase()

  // 관세법 엔티티
  for (const entity of CUSTOMS_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.customs += 0.05
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 행정법 엔티티
  for (const entity of ADMINISTRATIVE_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.administrative += 0.05
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 공무원법 엔티티
  for (const entity of CIVIL_SERVICE_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores['civil-service'] += 0.05
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 세법 엔티티
  for (const entity of TAX_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.tax += 0.05
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 3. 최고 점수 도메인 선택
  let bestDomain: LegalDomain = 'general'
  let bestScore = 0

  for (const [domain, score] of Object.entries(domainScores)) {
    if (score > bestScore) {
      bestScore = score
      bestDomain = domain as LegalDomain
    }
  }

  // 4. 신뢰도 계산 (0.0 ~ 1.0)
  const confidence = Math.min(bestScore, 1.0)

  return {
    domain: bestDomain,
    confidence,
    matchedTerms
  }
}
