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
import { debugLogger } from './debug-logger'
import { matchCitationContent, type MatchMethod } from './citation-content-matcher'

// C4: 조문 본문 LRU 캐시 (서버 인메모리). IndexedDB는 서버 런타임에서 사용 불가.
const CONTENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const CONTENT_CACHE_MAX = 500
interface ContentCacheEntry { content: string; ts: number }
const contentCache = new Map<string, ContentCacheEntry>()

function cacheGet(key: string): string | null {
  const hit = contentCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CONTENT_CACHE_TTL_MS) {
    contentCache.delete(key)
    return null
  }
  // LRU touch
  contentCache.delete(key)
  contentCache.set(key, hit)
  return hit.content
}

function cacheSet(key: string, content: string): void {
  if (contentCache.size >= CONTENT_CACHE_MAX) {
    const oldest = contentCache.keys().next().value
    if (oldest) contentCache.delete(oldest)
  }
  contentCache.set(key, { content, ts: Date.now() })
}

export interface VerifyOptions {
  mode?: 'existence' | 'content'
  signal?: AbortSignal
}

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
 * C4: verificationMethod에 내용 매칭 결과(`content-*`) 및 mismatch 추가.
 */
export interface VerifiedCitation extends Citation {
  verified: boolean
  verificationMethod:
    | 'eflaw-lookup'            // 조문 존재 확인만
    | 'content-exact'           // 본문 L1 substring 일치
    | 'content-token-jaccard'   // 본문 L2 token jaccard 일치
    | 'content-mismatch'        // 조문은 존재하나 내용 불일치 (환각 가능성)
    | 'not-found'
    | 'error'
    | 'skipped'
  verificationError?: string
  lawId?: string
  actualArticleExists?: boolean
  matchScore?: number
  matchMethod?: MatchMethod
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
export async function verifyCitation(
  citation: Citation,
  options: VerifyOptions = {},
): Promise<VerifiedCitation> {
  const mode = options.mode ?? 'existence'
  try {
    // Step 1: 법령 ID 확인 (이미 있으면 사용, 없으면 검색)
    let lawId = citation.lawId // ✅ 메타데이터에서 이미 추출된 lawId 사용

    if (!lawId) {
      // Fallback: 법령명으로 검색
      lawId = await fetchLawId(citation.lawName, options.signal) ?? undefined
    }

    if (!lawId) {
      return {
        ...citation,
        verified: false,
        verificationMethod: 'not-found',
        verificationError: `법령 "${citation.lawName}"을 찾을 수 없습니다`
      }
    }

    // Step 2: 모드 분기
    if (mode === 'existence') {
      const articleExists = await checkArticleExists(lawId, citation.articleNum, options.signal)
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
    }

    // mode === 'content': 실제 본문 fetch + L1/L2 매칭
    const actualContent = await fetchArticleContent(lawId, citation.articleNum, options.signal)
    if (actualContent === null) {
      return {
        ...citation,
        verified: false,
        verificationMethod: 'not-found',
        lawId,
        actualArticleExists: false,
        verificationError: `조문 "${citation.articleNum}"이 존재하지 않습니다`,
      }
    }

    const match = matchCitationContent(citation.text, actualContent)
    if (match.matched) {
      return {
        ...citation,
        verified: true,
        verificationMethod: match.method === 'exact' ? 'content-exact' : 'content-token-jaccard',
        lawId,
        actualArticleExists: true,
        matchScore: match.score,
        matchMethod: match.method,
      }
    }
    return {
      ...citation,
      verified: false,
      verificationMethod: 'content-mismatch',
      lawId,
      actualArticleExists: true,
      matchScore: match.score,
      matchMethod: 'mismatch',
      verificationError: `인용 내용이 실제 조문과 일치하지 않습니다 (score=${match.score.toFixed(2)})`,
    }
  } catch (error) {
    debugLogger.warning('[Citation Verifier] Error:', error)
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
  citations: Citation[],
  options: VerifyOptions = {},
): Promise<VerifiedCitation[]> {
  // C4: mode 기본값은 환경변수 플래그로 점진 롤아웃.
  // CITATION_CONTENT_VERIFY=true면 content 검증, 그 외 기존 존재 검증.
  const envMode: VerifyOptions['mode'] = process.env.CITATION_CONTENT_VERIFY === 'true'
    ? 'content'
    : 'existence'
  const mode = options.mode ?? envMode

  // 법제처 API rate limit (1000/min) 고려: 동시 10건 배치 검증
  const BATCH_SIZE = 10
  const results: VerifiedCitation[] = []
  for (let i = 0; i < citations.length; i += BATCH_SIZE) {
    const batch = citations.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map(c => verifyCitation(c, { mode, signal: options.signal })),
    )
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j]
      if (r.status === 'fulfilled') {
        results.push(r.value)
      } else {
        results.push({
          ...batch[j],
          verified: false,
          verificationMethod: 'error',
          verificationError: r.reason?.message || 'unknown error',
        })
      }
    }
  }
  return results
}

/**
 * law-search API로 법령 ID 조회
 *
 * @param lawName - 법령명 (예: "관세법")
 * @returns 법령 ID (예: "001556") 또는 null
 */
async function fetchLawId(lawName: string, externalSignal?: AbortSignal): Promise<string | null> {
  try {
    // law-search API 직접 호출 (외부 API)
    const LAW_OC = process.env.LAW_OC
    if (!LAW_OC) {
      debugLogger.warning('[Citation Verifier] LAW_OC 환경변수가 설정되지 않았습니다')
      return null
    }

    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_OC}&type=XML&target=law&query=${encodeURIComponent(lawName)}`
    const signal = externalSignal
      ? anySignal([externalSignal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000)
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal,
    })

    if (!response.ok) {
      debugLogger.warning('[Citation Verifier] law-search API error:', response.status)
      return null
    }

    const xmlText = await response.text()

    // XML 파싱
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

    // 첫 번째 법령 선택 (정확히 일치하는 경우)
    const laws = xmlDoc.getElementsByTagName('law')

    for (let i = 0; i < laws.length; i++) {
      const law = laws[i]
      const nameElement = law.getElementsByTagName('법령명한글')[0]
      const lawIdElement = law.getElementsByTagName('법령ID')[0] // ✅ 법령ID 사용 (법령일련번호 아님!)
      const mstElement = law.getElementsByTagName('법령일련번호')[0]

      if (!nameElement || !lawIdElement) continue

      const foundName = nameElement.textContent?.trim()
      const foundLawId = lawIdElement.textContent?.trim() // ✅ 법령ID (고유 ID)
      const foundMst = mstElement?.textContent?.trim() // MST (개정 버전 ID)

      // 정확히 일치하는 법령명 찾기
      if (foundName === lawName && foundLawId) {
        return foundLawId
      }
    }

    // 정확히 일치하는 것이 없으면 첫 번째 결과 사용
    if (laws.length > 0) {
      const firstLaw = laws[0]
      const firstLawId = firstLaw.getElementsByTagName('법령ID')[0]?.textContent?.trim() // ✅ 법령ID 사용
      const firstName = firstLaw.getElementsByTagName('법령명한글')[0]?.textContent?.trim()

      if (firstLawId) {
        return firstLawId
      }
    }

    debugLogger.warning(`[Citation Verifier] Law ID not found for "${lawName}"`)
    return null
  } catch (error) {
    debugLogger.warning('[Citation Verifier] fetchLawId error:', error)
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
  articleNum: string,
  externalSignal?: AbortSignal,
): Promise<boolean> {
  try {
    // 조문 번호가 없으면 검증 불가
    if (!articleNum || articleNum === '') {
      debugLogger.warning('[Citation Verifier] Empty article number')
      return false
    }

    // eflaw API 직접 호출 (외부 API)
    const LAW_OC = process.env.LAW_OC
    if (!LAW_OC) {
      debugLogger.warning('[Citation Verifier] LAW_OC 환경변수가 설정되지 않았습니다')
      return false
    }

    // ✅ XML 경량 파싱으로 전환 — 대형 법령(민법 등) JSON 전체 로드 시 OOM 위험 방지
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_OC}&target=law&type=XML&ID=${lawId}`
    const signal = externalSignal
      ? anySignal([externalSignal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000)
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal,
    })

    if (!response.ok) {
      debugLogger.warning('[Citation Verifier] eflaw API error:', response.status)
      return false
    }

    // 대형 법령(민법 등) OOM 방지: 10MB 초과 시 검증 스킵
    const contentLength = Number(response.headers.get('content-length') || '0')
    if (contentLength > 10 * 1024 * 1024) {
      debugLogger.warning(`[Citation Verifier] Response too large (${(contentLength / 1024 / 1024).toFixed(1)}MB), skipping verification for law ID ${lawId}`)
      return false
    }

    const xmlText = await response.text()

    // XML 파싱 (DOMParser는 이미 import됨)
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

    // 조문단위 태그에서 조문번호만 추출 (본문 내용은 무시)
    const articleUnits = xmlDoc.getElementsByTagName('조문단위')

    if (articleUnits.length === 0) {
      debugLogger.warning('[Citation Verifier] No article units found in XML')
      return false
    }

    const targetJoCode = buildJO(articleNum)

    let found = false
    for (let i = 0; i < articleUnits.length; i++) {
      const unit = articleUnits[i]

      const yeobu = unit.getElementsByTagName('조문여부')[0]?.textContent?.trim()
      if (yeobu !== '조문') continue

      const mainNum = Number(unit.getElementsByTagName('조문번호')[0]?.textContent?.trim() || '0')
      const branchNum = Number(unit.getElementsByTagName('조문가지번호')[0]?.textContent?.trim() || '0')
      const articleJoCode = mainNum.toString().padStart(4, '0') + branchNum.toString().padStart(2, '0')

      if (articleJoCode === targetJoCode) {
        found = true
        break
      }
    }

    if (!found) {
      debugLogger.warning(
        `[Citation Verifier] Article "${articleNum}" (JO: ${targetJoCode}) not found in law ID ${lawId}`
      )
    }

    return found
  } catch (error) {
    debugLogger.warning('[Citation Verifier] checkArticleExists error:', error)
    return false
  }
}

/**
 * C4: 조문 본문 fetch — 내용 매칭용.
 * checkArticleExists와 동일한 XML 응답을 파싱하되, 해당 조문의 본문 텍스트를 반환.
 * 캐시 히트 시 외부 fetch 생략.
 */
async function fetchArticleContent(
  lawId: string,
  articleNum: string,
  externalSignal?: AbortSignal,
): Promise<string | null> {
  if (!articleNum) return null
  const targetJoCode = buildJO(articleNum)
  const cacheKey = `${lawId}:${targetJoCode}`
  const hit = cacheGet(cacheKey)
  if (hit !== null) return hit

  const LAW_OC = process.env.LAW_OC
  if (!LAW_OC) return null

  try {
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_OC}&target=law&type=XML&ID=${lawId}`
    const signal = externalSignal
      ? anySignal([externalSignal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000)
    const response = await fetch(url, { next: { revalidate: 3600 }, signal })
    if (!response.ok) return null

    const contentLength = Number(response.headers.get('content-length') || '0')
    if (contentLength > 10 * 1024 * 1024) {
      debugLogger.warning(`[Citation Verifier] content fetch skip (too large) lawId=${lawId}`)
      return null
    }

    const xmlText = await response.text()
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    const units = xmlDoc.getElementsByTagName('조문단위')
    if (units.length === 0) return null

    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      const yeobu = unit.getElementsByTagName('조문여부')[0]?.textContent?.trim()
      if (yeobu !== '조문') continue
      const mainNum = Number(unit.getElementsByTagName('조문번호')[0]?.textContent?.trim() || '0')
      const branchNum = Number(unit.getElementsByTagName('조문가지번호')[0]?.textContent?.trim() || '0')
      const code = mainNum.toString().padStart(4, '0') + branchNum.toString().padStart(2, '0')
      if (code !== targetJoCode) continue

      // 조문내용 + 항/호/목 전부 concat
      const contentNodes = unit.getElementsByTagName('조문내용')
      const parts: string[] = []
      for (let k = 0; k < contentNodes.length; k++) {
        const t = contentNodes[k]?.textContent?.trim()
        if (t) parts.push(t)
      }
      const itemNodes = unit.getElementsByTagName('항내용')
      for (let k = 0; k < itemNodes.length; k++) {
        const t = itemNodes[k]?.textContent?.trim()
        if (t) parts.push(t)
      }
      const subNodes = unit.getElementsByTagName('호내용')
      for (let k = 0; k < subNodes.length; k++) {
        const t = subNodes[k]?.textContent?.trim()
        if (t) parts.push(t)
      }

      const joined = parts.join(' ').trim()
      if (joined) {
        cacheSet(cacheKey, joined)
        return joined
      }
      return null
    }

    return null
  } catch (error) {
    debugLogger.warning('[Citation Verifier] fetchArticleContent error:', error)
    return null
  }
}

/**
 * 복수 signal을 통합해 먼저 abort되는 신호를 따름.
 * AbortSignal.any는 Node 20+에서 안정 지원이나 보수적으로 polyfill.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  // 네이티브 any가 있으면 그대로 사용
  const NativeAny = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (typeof NativeAny === 'function') return NativeAny(signals)
  const ctrl = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason)
      return ctrl.signal
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true })
  }
  return ctrl.signal
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
