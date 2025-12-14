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
  type: 'law' | 'ai' | 'recent'
  category: string
  score: number  // 정렬용 점수
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.trim() || ''
  const queryLower = query.toLowerCase()
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20)

  if (!query || query.length < 1) {
    return NextResponse.json({ suggestions: [] })
  }

  const suggestions: Suggestion[] = []

  // 1. 법제처 API에서 법령명 검색 (2글자 이상)
  if (query.length >= 2) {
    const lawResults = await searchLawNames(query)
    for (const law of lawResults) {
      // 시작 위치에 따른 점수 (앞에서 매칭될수록 높은 점수)
      const matchIndex = law.name.toLowerCase().indexOf(queryLower)
      const startsWithQuery = law.name.toLowerCase().startsWith(queryLower)
      const score = 100 - (matchIndex >= 0 ? matchIndex : 50) + (startsWithQuery ? 50 : 0)

      suggestions.push({
        text: law.name,
        type: 'law',
        category: law.category,
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
