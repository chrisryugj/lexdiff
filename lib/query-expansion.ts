/**
 * 법령/조례 검색 쿼리 확장 엔진 (Query Expansion Engine)
 *
 * 사용자의 일상적 검색어를 법률 용어로 확장하여
 * 법제처 API 검색 적중률을 극대화
 *
 * 지원 도메인: 세금/조세, 관세/통관, 공무원/공직, 일반 행정
 *
 * @example
 * expandQuery("중소기업")
 * // → ["중소기업", "소상공인", "벤처기업", "창업", "기업육성", "영세사업자"]
 *
 * expandQuery("세금 감면")
 * // → ["세금 감면", "조세 감면", "세액공제", "비과세", "면세"]
 *
 * @module query-expansion
 */

import {
  HYPERNYM_MAP,
  COLLOQUIAL_TO_LEGAL,
  synonymIndex,
  knownTermSet,
  allKnownTerms,
  REGION_PATTERN,
  STANDALONE_REGION_PATTERN,
} from './query-expansion-data'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 하위 호환 re-export — 기존 import 경로를 유지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type { OrdinanceSearchStrategy } from './ordinance-search-strategy'
export { scoreRelevance, buildOrdinanceSearchStrategies } from './ordinance-search-strategy'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자연어 전처리 유틸리티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 복합어를 사전에 등록된 하위 용어로 분해
 * "중소기업육성기금" → ["중소기업", "기금"]
 * "소상공인창업지원" → ["소상공인", "창업"]
 */
function decomposeCompound(word: string): string[] {
  const lower = word.toLowerCase()
  const found: string[] = []
  let remaining = lower

  for (const term of allKnownTerms) {
    if (remaining.includes(term)) {
      found.push(term)
      remaining = remaining.replace(term, ' ')
    }
  }

  return found
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자연어 전처리 — 조사/어미/불용어 제거
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 한국어 조사/어미를 제거하여 어근 추출
 * 사전을 키우지 않고 기존 사전 재활용을 극대화하는 핵심 전략
 *
 * "창업할" → "창업", "키우려면" → "키우", "위생관련" → "위생"
 */
function stripKoreanSuffix(word: string): string {
  if (word.length < 3) return word
  // 긴 패턴부터 매칭 (greedy)
  const suffixes = [
    '하려면', '으려면', '에서는', '에서의',
    '에게는', '에게도', '까지는', '부터는',
    '하는', '하고', '하면', '하여', '해서', '했던', '할때',
    '받는', '받을', '받고', '되는', '되어', '되고',
    '에게', '에서', '까지', '부터', '마다', '처럼', '같이',
    '한테', '보다', '으로', '에는', '에도', '에만',
    '려면', '인지', '인가',
    '할', '한', '된',  // 용언 활용 (어근 >= 2글자 보장)
    '은', '는', '이', '가', '을', '를', '의', '에', '로',
    '와', '과', '도', '만', '서',
  ]
  for (const suf of suffixes) {
    if (word.endsWith(suf) && word.length - suf.length >= 2) {
      return word.slice(0, -suf.length)
    }
  }
  return word
}

/** 자연어 불용어 — 검색에 무의미한 단어 */
const NATURAL_LANG_STOPWORDS = new Set([
  '어떤', '어떻게', '무엇', '어디', '우리', '동네', '방법',
  '궁금해요', '궁금합니다', '알고', '싶어요', '싶습니다',
  '찾는', '있나요', '있을까요', '뭐가', '뭘', '어디서',
])

/**
 * 자연어 쿼리를 검색 키워드로 정제
 * 1. 법률 불용어 제거 (조례, 규칙 등)
 * 2. 자연어 불용어 제거 (우리, 어떤 등)
 * 3. 조사/어미 제거 (창업할 → 창업)
 * 4. 사전에 있는 용어 우선, 없으면 어근 시도
 */
function extractKeywords(text: string): string[] {
  const legalStop = /\s*(에\s*관한|에\s*대한|에\s*관하여|관련|조례|조레|자치법규|규칙|법률|시행령|시행규칙|규정)\s*/g
  const cleaned = text.replace(legalStop, ' ').replace(/\s+/g, ' ').trim()
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2)

  const keywords: string[] = []
  for (const w of words) {
    // 자연어 불용어 → 스킵
    if (NATURAL_LANG_STOPWORDS.has(w)) continue

    // 사전에 있으면 그대로 사용
    const lower = w.toLowerCase()
    if (knownTermSet.has(lower)) {
      keywords.push(w)
      continue
    }

    // 어근 추출 후 재검색
    const stem = stripKoreanSuffix(w)
    // 어근이 불용어면 스킵 ("동네에서" → "동네" → 불용어)
    if (NATURAL_LANG_STOPWORDS.has(stem)) continue

    if (stem !== w && knownTermSet.has(stem.toLowerCase())) {
      keywords.push(stem)
      continue
    }

    // 복합어 분해 시도 — "식품위생" → ["식품", "위생"]
    const target = stem.length >= 2 ? stem : w
    if (target.length >= 4) {
      const parts = decomposeCompound(target)
      if (parts.length > 0) {
        keywords.push(...parts)
        continue
      }
    }

    // 어근도 사전에 없으면 원본 유지 (API가 직접 검색)
    if (stem.length >= 2) {
      keywords.push(stem)
    } else if (w.length >= 2) {
      keywords.push(w)
    }
  }

  // 중복 제거
  return [...new Set(keywords)]
}

/**
 * 쿼리에서 지역명과 키워드를 분리 + 자연어 전처리
 * expandQuery와 buildOrdinanceSearchStrategies 양쪽에서 공유
 */
export function parseQueryRegionAndKeywords(query: string): {
  region: string
  subRegion: string
  keywords: string[]
  cleaned: string
} {
  // 법률 불용어 제거
  const legalStop = /\s*(에\s*관한|에\s*대한|에\s*관하여|관련|조례|조레|자치법규|규칙|법률|시행령|시행규칙|규정)\s*/g
  const cleaned = query.replace(legalStop, ' ').replace(/\s+/g, ' ').trim()

  // 지역명 추출
  const regionMatch = cleaned.match(REGION_PATTERN)
  let region = regionMatch ? regionMatch[0].trim() : ''
  let subRegion = regionMatch?.[2]?.trim() || ''

  if (subRegion) {
    if (knownTermSet.has(subRegion.toLowerCase())) {
      region = ''
      subRegion = ''
    }
    if (region && regionMatch) {
      const matchEnd = cleaned.indexOf(regionMatch[0]) + regionMatch[0].length
      if (matchEnd < cleaned.length && /[가-힣]/.test(cleaned[matchEnd])) {
        region = ''
        subRegion = ''
      }
    }
  }

  if (!region) {
    const standaloneMatch = cleaned.match(STANDALONE_REGION_PATTERN)
    if (standaloneMatch) {
      region = standaloneMatch[1].trim()
      subRegion = ''
    }
  }

  // 세종시 특별 처리
  if (region === '세종시' || subRegion === '세종시') {
    region = '세종특별자치시'
    subRegion = ''
  }

  const keywordPart = region ? cleaned.replace(region, '').trim() : cleaned

  // extractKeywords로 자연어 전처리 (불용어 제거 + 어근 추출)
  const keywords = extractKeywords(keywordPart)

  return { region, subRegion, keywords, cleaned }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 쿼리 확장 엔진
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface QueryExpansionResult {
  /** 원본 키워드 */
  original: string
  /** 확장된 동의어/유의어 (원본 포함) */
  expanded: string[]
  /** 어떤 매핑으로 확장되었는지 */
  sources: Array<{
    type: 'synonym' | 'hypernym' | 'colloquial'
    from: string
    to: string[]
  }>
}

/**
 * 단일 키워드를 동의어/유의어로 확장
 *
 * 확장 우선순위:
 * 1. 일상어 → 법률용어 변환
 * 2. 동의어 그룹 매핑
 * 3. 상위어 → 하위어 확장
 */
export function expandKeyword(keyword: string): QueryExpansionResult {
  const key = keyword.trim().toLowerCase()
  const result: QueryExpansionResult = {
    original: keyword.trim(),
    expanded: [keyword.trim()],
    sources: [],
  }

  const seen = new Set<string>([key])

  // 1. 일상어 → 법률용어
  if (COLLOQUIAL_TO_LEGAL[key]) {
    const legalTerms = COLLOQUIAL_TO_LEGAL[key]
    for (const term of legalTerms) {
      if (!seen.has(term.toLowerCase())) {
        result.expanded.push(term)
        seen.add(term.toLowerCase())
      }
    }
    result.sources.push({ type: 'colloquial', from: keyword, to: legalTerms })
  }

  // 2. 동의어 그룹
  const synonyms = synonymIndex.get(key)
  if (synonyms) {
    for (const syn of synonyms) {
      if (!seen.has(syn.toLowerCase())) {
        result.expanded.push(syn)
        seen.add(syn.toLowerCase())
      }
    }
    result.sources.push({ type: 'synonym', from: keyword, to: Array.from(synonyms) })
  }

  // 3. 상위어 → 하위어
  if (HYPERNYM_MAP[key]) {
    const hyponyms = HYPERNYM_MAP[key]
    for (const h of hyponyms) {
      if (!seen.has(h.toLowerCase())) {
        result.expanded.push(h)
        seen.add(h.toLowerCase())
      }
    }
    result.sources.push({ type: 'hypernym', from: keyword, to: hyponyms })
  }

  // 4. 복합어 분해 — 직접 매칭이 없을 때 하위 용어로 쪼개서 각각 확장
  // "중소기업육성기금" → "중소기업" 발견 → 소상공인, 소기업 등 추가
  if (result.sources.length === 0 && key.length >= 4) {
    const parts = decomposeCompound(key)
    if (parts.length > 0) {
      for (const part of parts) {
        // 각 부분의 동의어 추가
        const partSynonyms = synonymIndex.get(part)
        if (partSynonyms) {
          for (const syn of partSynonyms) {
            if (!seen.has(syn.toLowerCase())) {
              result.expanded.push(syn)
              seen.add(syn.toLowerCase())
            }
          }
        }
        // 각 부분도 확장 키워드에 추가
        if (!seen.has(part)) {
          result.expanded.push(part)
          seen.add(part)
        }
      }
      result.sources.push({ type: 'synonym', from: keyword, to: parts })
    }
  }

  return result
}

/**
 * 복합 쿼리에서 키워드를 추출하고 각각 확장
 *
 * @param query 전체 검색 쿼리
 * @param excludeRegion true이면 지역명은 확장하지 않음
 */
export function expandQuery(query: string, _excludeRegion = true): {
  /** 모든 확장 키워드 (중복 제거) */
  allExpanded: string[]
  /** 키워드별 확장 결과 */
  details: QueryExpansionResult[]
} {
  const { keywords } = parseQueryRegionAndKeywords(query)

  const details: QueryExpansionResult[] = []
  const allExpanded = new Set<string>()

  for (const kw of keywords) {
    const expansion = expandKeyword(kw)
    details.push(expansion)
    for (const e of expansion.expanded) {
      allExpanded.add(e)
    }
  }

  return { allExpanded: Array.from(allExpanded), details }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 법령 검색 쿼리 확장 (법령 검색용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 법령 검색용 쿼리 확장
 * 법령명에 포함될 수 있는 동의어/유의어를 생성
 *
 * @example
 * expandForLawSearch("세금 감면")
 * // → ["세금 감면", "조세 감면", "세액공제", "비과세"]
 */
export function expandForLawSearch(query: string): string[] {
  const expansion = expandQuery(query, true)
  // 법령 검색은 보수적으로 — 동의어만 (하위어 제외)
  return expansion.allExpanded.filter(e => {
    const details = expansion.details.find(d => d.expanded.includes(e))
    if (!details) return false
    if (e === details.original) return true
    // 이 특정 용어가 colloquial 또는 synonym 소스에서 왔는지 확인
    // (hypernym 소스에서만 온 용어는 제외 — 너무 넓어짐)
    return details.sources.some(s =>
      (s.type === 'colloquial' || s.type === 'synonym') &&
      s.to.some(t => t.toLowerCase() === e.toLowerCase())
    )
  })
}
