/**
 * Citation Verification System
 *
 * RAG에서 추출한 법령 인용이 실제로 존재하는지 검증
 *
 * Phase 1 (현재):
 * - 법령 ID 확인 (law-search API)
 * - 조문 존재 확인 (eflaw API)
 *
 * Phase 2 (향후):
 * - 내용 일치 확인 (Fuzzy matching)
 * - 개정일 버전 확인
 */

import { DOMParser } from '@xmldom/xmldom'
import { buildJO, formatJO } from './law-parser'

/**
 * RAG Citation 타입 (file-search-client.ts와 동일)
 */
export interface Citation {
  lawName: string
  lawId?: string // 법령 ID (메타데이터에서 추출)
  articleNum: string // "제38조", "제38조의2" 등
  articleTitle?: string // 조문 제목 (예: "신고납부")
  text: string
  source: string
  relevanceScore?: number
  effectiveDate?: string
}

/**
 * 검증된 Citation 타입
 */
export interface VerifiedCitation extends Citation {
  verified: boolean
  verificationMethod: 'eflaw-lookup' | 'not-found' | 'error'
  verificationError?: string
  lawId?: string
  actualArticleExists?: boolean
}

/**
 * Law Search API 응답 타입
 */
interface LawSearchResult {
  lawId: string
  lawName: string
}

/**
 * 단일 Citation 검증
 *
 * @param citation - RAG에서 추출한 인용
 * @returns 검증 결과 포함된 Citation
 */
export async function verifyCitation(citation: Citation): Promise<VerifiedCitation> {
  try {
    // Step 1: 법령 ID 확인 (이미 있으면 사용, 없으면 검색)
    let lawId = citation.lawId // ✅ 메타데이터에서 이미 추출된 lawId 사용

    if (!lawId) {
      // Fallback: 법령명으로 검색
      lawId = await fetchLawId(citation.lawName) ?? undefined
    } else {
      console.log(`[Citation Verifier] ✅ Using lawId from citation metadata: ${lawId}`)
    }

    if (!lawId) {
      return {
        ...citation,
        verified: false,
        verificationMethod: 'not-found',
        verificationError: `법령 "${citation.lawName}"을 찾을 수 없습니다`
      }
    }

    // Step 2: eflaw API로 조문 목록 확인
    const articleExists = await checkArticleExists(lawId, citation.articleNum)

    return {
      ...citation,
      verified: articleExists,
      verificationMethod: articleExists ? 'eflaw-lookup' : 'not-found',
      lawId,
      actualArticleExists: articleExists,
      verificationError: !articleExists
        ? `조문 "${citation.articleNum}"이 존재하지 않습니다`
        : undefined
    }
  } catch (error) {
    console.error('[Citation Verifier] Error:', error)
    return {
      ...citation,
      verified: false,
      verificationMethod: 'error',
      verificationError: error instanceof Error ? error.message : '검증 중 오류 발생'
    }
  }
}

/**
 * 여러 Citations 일괄 검증
 *
 * @param citations - RAG에서 추출한 인용 목록
 * @returns 검증 결과 배열
 */
export async function verifyAllCitations(
  citations: Citation[]
): Promise<VerifiedCitation[]> {
  console.log(`[Citation Verifier] Verifying ${citations.length} citations...`)

  // 병렬 검증 (Promise.all)
  const verifiedCitations = await Promise.all(
    citations.map(c => verifyCitation(c))
  )

  const successCount = verifiedCitations.filter(c => c.verified).length
  const failCount = verifiedCitations.length - successCount

  console.log(`[Citation Verifier] Results: ✅ ${successCount} verified, ❌ ${failCount} failed`)

  return verifiedCitations
}

/**
 * law-search API로 법령 ID 조회
 *
 * @param lawName - 법령명 (예: "관세법")
 * @returns 법령 ID (예: "001556") 또는 null
 */
async function fetchLawId(lawName: string): Promise<string | null> {
  try {
    // law-search API 직접 호출 (외부 API)
    const LAW_OC = process.env.LAW_OC
    if (!LAW_OC) {
      console.error('[Citation Verifier] LAW_OC 환경변수가 설정되지 않았습니다')
      return null
    }

    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_OC}&type=XML&target=law&query=${encodeURIComponent(lawName)}`
    const response = await fetch(url, {
      next: { revalidate: 3600 } // 1시간 캐시
    })

    if (!response.ok) {
      console.error('[Citation Verifier] law-search API error:', response.status)
      return null
    }

    const xmlText = await response.text()

    // XML 파싱
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

    // 첫 번째 법령 선택 (정확히 일치하는 경우)
    const laws = xmlDoc.getElementsByTagName('law')

    console.log(`[Citation Verifier] 🔍 Searching for "${lawName}", found ${laws.length} results`)

    for (let i = 0; i < laws.length; i++) {
      const law = laws[i]
      const nameElement = law.getElementsByTagName('법령명한글')[0]
      const lawIdElement = law.getElementsByTagName('법령ID')[0] // ✅ 법령ID 사용 (법령일련번호 아님!)
      const mstElement = law.getElementsByTagName('법령일련번호')[0]

      if (!nameElement || !lawIdElement) continue

      const foundName = nameElement.textContent?.trim()
      const foundLawId = lawIdElement.textContent?.trim() // ✅ 법령ID (고유 ID)
      const foundMst = mstElement?.textContent?.trim() // MST (개정 버전 ID)

      console.log(`[Citation Verifier] 📋 Result ${i + 1}: "${foundName}" (법령ID: ${foundLawId}, MST: ${foundMst})`)

      // 정확히 일치하는 법령명 찾기
      if (foundName === lawName && foundLawId) {
        console.log(`[Citation Verifier] ✅ Found exact match: ${foundLawId} for "${lawName}"`)
        return foundLawId
      }
    }

    // 정확히 일치하는 것이 없으면 첫 번째 결과 사용
    if (laws.length > 0) {
      const firstLaw = laws[0]
      const firstLawId = firstLaw.getElementsByTagName('법령ID')[0]?.textContent?.trim() // ✅ 법령ID 사용
      const firstName = firstLaw.getElementsByTagName('법령명한글')[0]?.textContent?.trim()

      if (firstLawId) {
        console.log(`[Citation Verifier] ⚠️  No exact match, using first result: ${firstLawId} for "${firstName}"`)
        return firstLawId
      }
    }

    console.warn(`[Citation Verifier] ⚠️  Law ID not found for "${lawName}"`)
    return null
  } catch (error) {
    console.error('[Citation Verifier] fetchLawId error:', error)
    return null
  }
}

/**
 * eflaw API로 조문 존재 확인
 *
 * @param lawId - 법령 ID (예: "001556")
 * @param articleNum - 조문 번호 (예: "제38조", "제38조의2")
 * @returns 조문 존재 여부
 */
async function checkArticleExists(
  lawId: string,
  articleNum: string
): Promise<boolean> {
  try {
    // 조문 번호가 없으면 검증 불가
    if (!articleNum || articleNum === '') {
      console.warn('[Citation Verifier] ⚠️  Empty article number')
      return false
    }

    // eflaw API 직접 호출 (외부 API)
    const LAW_OC = process.env.LAW_OC
    if (!LAW_OC) {
      console.error('[Citation Verifier] LAW_OC 환경변수가 설정되지 않았습니다')
      return false
    }

    // ✅ lawId는 법령ID이므로 ID 파라미터 사용 (MST 아님!)
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_OC}&target=law&type=JSON&ID=${lawId}`
    console.log(`[Citation Verifier] 🔍 Fetching articles for law ID: ${lawId}`)

    const response = await fetch(url, {
      next: { revalidate: 3600 } // 1시간 캐시
    })

    if (!response.ok) {
      console.error('[Citation Verifier] eflaw API error:', response.status)
      return false
    }

    const data = await response.json()

    // API 응답 구조 확인
    const lawData = data?.법령 || data

    if (!lawData || !lawData.조문) {
      console.warn('[Citation Verifier] ⚠️  No articles found in eflaw response')
      return false
    }

    // ✅ 올바른 구조: lawData.조문.조문단위[] (law-json-parser.ts와 동일)
    const articleUnits = lawData.조문?.조문단위 || []
    console.log(`[Citation Verifier] 📋 Total articles in law: ${articleUnits.length}`)

    if (articleUnits.length === 0) {
      console.warn('[Citation Verifier] ⚠️  No article units found')
      return false
    }

    // 조문 번호를 JO Code로 변환 (예: "제38조" → "003800")
    const targetJoCode = buildJO(articleNum)

    // 첫 5개 조문의 조문번호 출력 (디버깅용)
    console.log(`[Citation Verifier] 📝 Sample article codes (first 5):`,
      articleUnits.slice(0, 5).map((unit: any) => ({
        조문번호: unit.조문번호,
        조문여부: unit.조문여부,
        조문제목: unit.조문제목?.substring(0, 30)
      }))
    )

    // 조문 목록에서 일치하는 조문 찾기
    const found = articleUnits.some((unit: any) => {
      // 조문이 아닌 경우 스킵 (예: 편, 장, 절 등)
      if (unit.조문여부 !== '조문') return false

      // ✅ 조문번호를 buildJO() 형식으로 변환 (4+2 형식)
      // 예: "61" → "006100" (article 4자리 + branch 2자리)
      const articleNum = unit.조문번호 || '0'
      const mainNum = Number(articleNum)
      const articleJoCode = mainNum.toString().padStart(4, '0') + '00' // branch는 항상 00

      // JO Code 비교
      if (articleJoCode === targetJoCode) {
        console.log(`[Citation Verifier] ✅ Found article: ${unit.조문번호} (JO: ${targetJoCode})`)
        return true
      }

      return false
    })

    if (!found) {
      console.warn(
        `[Citation Verifier] ⚠️  Article "${articleNum}" (JO: ${targetJoCode}) not found in law ID ${lawId}`
      )
    }

    return found
  } catch (error) {
    console.error('[Citation Verifier] checkArticleExists error:', error)
    return false
  }
}

/**
 * 검증 통계 계산
 *
 * @param verifiedCitations - 검증된 인용 목록
 * @returns 통계 객체
 */
export function getVerificationStats(verifiedCitations: VerifiedCitation[]) {
  const total = verifiedCitations.length
  const verified = verifiedCitations.filter(c => c.verified).length
  const failed = total - verified
  const verificationRate = total > 0 ? (verified / total) * 100 : 0

  return {
    total,
    verified,
    failed,
    verificationRate: verificationRate.toFixed(1) + '%'
  }
}
