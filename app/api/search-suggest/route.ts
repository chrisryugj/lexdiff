/**
 * 검색어 자동완성 API
 *
 * 법령 검색과 AI 질문을 구분하여 추천 키워드를 반환
 * - 법령: 법제처 API 실시간 검색
 * - AI 질문: 템플릿 기반 생성
 *
 * GET /api/search-suggest?q=관세
 *
 * Response:
 * {
 *   suggestions: [
 *     { text: "관세법", type: "law", category: "법률" },
 *     { text: "관세율표", type: "law", category: "법률" },
 *     { text: "관세 환급 요건은?", type: "ai", category: "AI 질문" },
 *     { text: "관세 신고 절차는?", type: "ai", category: "AI 질문" }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { expandQuery } from '@/lib/query-expansion'
import { containsLocalGovName } from '@/src/domain/patterns/OrdinancePattern'

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do"
const OC = process.env.LAW_OC || ""

// 도메인별 AI 질문 템플릿
const AI_QUESTION_TEMPLATES: Record<string, string[]> = {
  '관세': [
    '관세 환급 요건은?',
    '관세 신고 절차는?',
    '관세율 적용 기준은?',
    'FTA 특혜관세 요건은?',
    '과세가격 산정 방법은?',
  ],
  '수입': [
    '수입신고 절차는?',
    '수입통관 요건은?',
    '수입물품 관세율은?',
    '수입금지 품목은?',
  ],
  '수출': [
    '수출신고 절차는?',
    '수출통관 방법은?',
    '수출 환급 요건은?',
  ],
  '원산지': [
    '원산지 결정기준은?',
    '원산지증명서 발급 방법은?',
    '원산지 사후검증이란?',
  ],
  '행정': [
    '행정심판 청구 절차는?',
    '행정처분 취소 요건은?',
    '이의신청 방법은?',
  ],
  '허가': [
    '영업허가 요건은?',
    '허가 취소 사유는?',
    '허가 갱신 절차는?',
  ],
  '공무원': [
    '공무원 승진 요건은?',
    '징계 절차는?',
    '휴직 요건은?',
    '연가 일수 산정 방법은?',
  ],
  '퇴직': [
    '퇴직급여 산정 방법은?',
    '명예퇴직 요건은?',
    '퇴직연금 수령 절차는?',
  ],
  '세금': [
    '종합소득세 신고 방법은?',
    '부가가치세 환급 요건은?',
    '세액공제 받으려면?',
  ],
  '계약': [
    '계약 해제 요건은?',
    '손해배상 범위는?',
    '계약금 반환 받으려면?',
  ],
  '임대차': [
    '전세보증금 보호 요건은?',
    '임대차 계약 갱신 요건은?',
    '임차인 권리는?',
  ],
  '근로': [
    '연차휴가 산정 방법은?',
    '해고 요건은?',
    '퇴직금 계산 방법은?',
    '초과근무 수당 산정은?',
  ],
}

// 받침 유무에 따라 "이란/란" 선택
function getPostposition(word: string): string {
  if (!word) return '이란'
  const lastChar = word.charAt(word.length - 1)
  const code = lastChar.charCodeAt(0)
  // 한글 범위: 0xAC00 ~ 0xD7A3
  if (code < 0xAC00 || code > 0xD7A3) return '이란'
  // 받침 유무: (code - 0xAC00) % 28 === 0 이면 받침 없음
  const hasFinalConsonant = (code - 0xAC00) % 28 !== 0
  return hasFinalConsonant ? '이란' : '란'
}

// 법제처 API에서 법령명 검색
async function searchLawNames(query: string): Promise<Array<{ name: string; category: string }>> {
  if (!OC || query.length < 2) return []

  try {
    const url = `${LAW_API_BASE}?OC=${OC}&target=law&type=XML&query=${encodeURIComponent(query)}&display=10`
    const response = await fetch(url, {
      next: { revalidate: 300 }, // 5분 캐시
      signal: AbortSignal.timeout(3000) // 3초 타임아웃
    })

    if (!response.ok) return []

    const xml = await response.text()
    const results: Array<{ name: string; category: string }> = []

    // XML에서 법령명 추출: <법령명한글>...</법령명한글>
    const lawNameRegex = /<법령명한글>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/법령명한글>/g
    const lawTypeRegex = /<법령구분>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/법령구분>/g

    const names: string[] = []
    const types: string[] = []

    let match
    while ((match = lawNameRegex.exec(xml)) !== null) {
      names.push(match[1].trim())
    }
    while ((match = lawTypeRegex.exec(xml)) !== null) {
      types.push(match[1].trim())
    }

    for (let i = 0; i < names.length; i++) {
      results.push({
        name: names[i],
        category: types[i] || '법령'
      })
    }

    return results
  } catch {
    // 타임아웃 또는 네트워크 에러 - 조용히 실패
    return []
  }
}

// 자치법규(조례/규칙) 검색
async function searchOrdinances(query: string): Promise<Array<{ name: string; category: string }>> {
  if (!OC || query.length < 2) return []

  try {
    // 자치법규 API: target=ordin
    const url = `${LAW_API_BASE}?OC=${OC}&target=ordin&type=XML&query=${encodeURIComponent(query)}&display=10`
    const response = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000)
    })

    if (!response.ok) return []

    const xml = await response.text()
    const results: Array<{ name: string; category: string }> = []

    // 자치법규 XML 구조: <자치법규명>...</자치법규명>
    const nameRegex = /<자치법규명>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/자치법규명>/g
    const typeRegex = /<자치법규분류>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/자치법규분류>/g

    const names: string[] = []
    const types: string[] = []

    let match
    while ((match = nameRegex.exec(xml)) !== null) {
      names.push(match[1].trim())
    }
    while ((match = typeRegex.exec(xml)) !== null) {
      types.push(match[1].trim())
    }

    for (let i = 0; i < names.length; i++) {
      results.push({
        name: names[i],
        category: types[i] || '조례'
      })
    }

    return results
  } catch {
    return []
  }
}

// 일반적인 질문 패턴 생성
function generateAiQuestions(keyword: string): string[] {
  const postposition = getPostposition(keyword)
  const patterns = [
    `${keyword}${postposition}?`,
    `${keyword} 요건은?`,
    `${keyword} 절차는?`,
    `${keyword} 방법은?`,
  ]
  return patterns
}

interface Suggestion {
  text: string
  type: 'law' | 'ai' | 'recent' | 'precedent' | 'interpretation' | 'ruling'
  category: string
  score: number  // 정렬용 점수
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.trim() || ''
  const queryLower = query.toLowerCase()
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20)
  const scope = searchParams.get('scope') || '' // 'all' = 항상 조례 포함, 'law-only' = 법령만

  if (!query || query.length < 1) {
    return NextResponse.json({ suggestions: [] })
  }

  const suggestions: Suggestion[] = []

  // 0. 판례/해석례/재결례 패턴 감지 (공백 허용)
  const precedentPattern = /(대법원|서울고등법원|고등법원|지방법원|특허법원|행정법원)\s*\d{4}(?:(도|나|가|마|머|바|사|아|자|카|타|파|하|고단|노|초|추|로|두|구|누|부)\s*\d*)?/
  const rulingPattern = /(\d{4}[가-힣]{2,4}\s*\d+|조심\d{4}[가-힣]{2,4}\s*\d+|국심\d{4}[가-힣]{2,4}\s*\d+)/
  const interpretationPattern = /(행정해석|예규|고시|훈령|지침|기획재정부|국토교통부|법제처)/

  if (precedentPattern.test(query)) {
    suggestions.push({
      text: query,
      type: 'precedent',
      category: '판례',
      score: 200  // 최우선
    })
  }

  if (rulingPattern.test(query)) {
    suggestions.push({
      text: query,
      type: 'ruling',
      category: '재결례',
      score: 199
    })
  }

  if (interpretationPattern.test(query)) {
    suggestions.push({
      text: query,
      type: 'interpretation',
      category: '해석례',
      score: 198
    })
  }

  // 1. 법제처 API에서 법령명 + 조례 검색 (2글자 이상, 병렬 호출)
  // ⚠️ 판례 패턴이면 법령 검색 스킵
  const isPrecedent = precedentPattern.test(query)
  const isRuling = rulingPattern.test(query)

  if (query.length >= 2 && !isPrecedent && !isRuling) {
    // 조문 패턴 감지 및 법령명 추출 (예: "관세법 38조" → "관세법")
    let searchQuery = query
    const articlePattern = /^(.+?)\s+(?:제?\s*\d+\s*조(?:의\s*\d+)?)/
    const articleMatch = query.match(articlePattern)
    if (articleMatch) {
      searchQuery = articleMatch[1].trim()  // 법령명만 추출
    }

    // 조례 감지: scope=all이면 항상, 아니면 OrdinancePattern 공용 로직 사용
    const isOrdinanceQuery = scope === 'all' || /조례|규칙|자치법규/.test(query) || containsLocalGovName(query)

    // 동의어 확장: 원본 + 상위 2개 동의어 병렬 호출 (응답 시간 제약)
    const expansion = expandQuery(searchQuery)
    const expandedQueries = expansion.allExpanded
      .filter(e => e !== searchQuery && e.length >= 2)
      .slice(0, 2) // 최대 2개 추가 (3초 타임아웃 내 처리)

    // 병렬 검색: 원본 + 확장 쿼리 (법령 + 조례)
    const lawSearches = [
      scope === 'law-only' ? Promise.resolve([]) : searchLawNames(searchQuery),
      ...expandedQueries.map(eq =>
        scope === 'law-only' ? Promise.resolve([]) : searchLawNames(eq)
      ),
    ]
    const ordinSearches = [
      isOrdinanceQuery ? searchOrdinances(searchQuery) : Promise.resolve([]),
      ...expandedQueries.map(eq =>
        isOrdinanceQuery ? searchOrdinances(eq) : Promise.resolve([])
      ),
    ]

    const allResults = await Promise.all([...lawSearches, ...ordinSearches])
    const lawResults = allResults.slice(0, lawSearches.length).flat()
    const ordinanceResults = allResults.slice(lawSearches.length).flat()

    // 중복 제거 (같은 법령명)
    const seenNames = new Set<string>()
    const dedupLaw = lawResults.filter(r => {
      if (seenNames.has(r.name)) return false
      seenNames.add(r.name)
      return true
    })
    const dedupOrdin = ordinanceResults.filter(r => {
      if (seenNames.has(r.name)) return false
      seenNames.add(r.name)
      return true
    })

    // 법령 결과 추가
    for (const law of dedupLaw) {
      const matchIndex = law.name.toLowerCase().indexOf(queryLower)
      const startsWithQuery = law.name.toLowerCase().startsWith(queryLower)
      let score = 100 - (matchIndex >= 0 ? matchIndex : 50) + (startsWithQuery ? 50 : 0)
      let suggestionText = law.name

      // 조문 패턴 감지 시: "법령명 + 제X조" 형태로 제안
      if (articleMatch) {
        score += 100
        // 원본 쿼리에서 조문 번호 추출 (예: "38조" → "제38조")
        const articlePart = query.substring(articleMatch[1].length).trim()
        const normalized = articlePart.replace(/^제?\s*(\d+)\s*조(의\s*\d+)?/, (_, num, sub) =>
          `제${num}조${sub ? sub.replace(/\s+/g, '') : ''}`
        )
        suggestionText = `${law.name} ${normalized}`
      }

      suggestions.push({
        text: suggestionText,
        type: 'law',
        category: law.category,
        score
      })
    }

    // 조례 결과 추가
    for (const ordin of dedupOrdin) {
      const matchIndex = ordin.name.toLowerCase().indexOf(queryLower)
      const startsWithQuery = ordin.name.toLowerCase().startsWith(queryLower)
      let score = 95 - (matchIndex >= 0 ? matchIndex : 50) + (startsWithQuery ? 50 : 0)  // 법령보다 약간 낮은 기본 점수
      let suggestionText = ordin.name

      // 조문 패턴 감지 시: "조례명 + 제X조" 형태로 제안
      if (articleMatch) {
        score += 100
        const articlePart = query.substring(articleMatch[1].length).trim()
        const normalized = articlePart.replace(/^제?\s*(\d+)\s*조(의\s*\d+)?/, (_, num, sub) =>
          `제${num}조${sub ? sub.replace(/\s+/g, '') : ''}`
        )
        suggestionText = `${ordin.name} ${normalized}`
      }

      suggestions.push({
        text: suggestionText,
        type: 'law',  // UI에서는 법령과 동일하게 표시
        category: ordin.category,
        score
      })
    }
  }

  // 2. AI 질문 템플릿 매칭
  for (const [keyword, questions] of Object.entries(AI_QUESTION_TEMPLATES)) {
    if (keyword.includes(queryLower) || queryLower.includes(keyword)) {
      for (const q of questions) {
        suggestions.push({
          text: q,
          type: 'ai',
          category: 'AI 질문',
          score: 80
        })
      }
    }
  }

  // 3. 일반적인 AI 질문 패턴 생성 (매칭되는 템플릿이 없을 때)
  if (suggestions.filter(s => s.type === 'ai').length === 0 && query.length >= 2) {
    const generalQuestions = generateAiQuestions(query)
    for (const q of generalQuestions) {
      suggestions.push({
        text: q,
        type: 'ai',
        category: 'AI 질문',
        score: 60
      })
    }
  }

  // 4. 정렬: 점수 높은 순, 같은 점수면 법령 > AI
  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.type === 'law' && b.type === 'ai') return -1
    if (a.type === 'ai' && b.type === 'law') return 1
    return 0
  })

  // 5. 중복 제거 및 제한
  const uniqueSuggestions = suggestions
    .filter((s, i, arr) => arr.findIndex(x => x.text === s.text) === i)
    .slice(0, limit)
    .map(({ text, type, category }) => ({ text, type, category }))

  return NextResponse.json({
    suggestions: uniqueSuggestions,
    query
  })
}
