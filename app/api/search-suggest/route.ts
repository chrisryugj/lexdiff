/**
 * 검색어 자동완성 API
 *
 * 법령 검색과 AI 질문을 구분하여 추천 키워드를 반환
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

// 자주 검색되는 법령 목록 (캐시용)
const POPULAR_LAWS = [
  // 관세/무역
  '관세법', '관세법 시행령', '관세법 시행규칙',
  '자유무역협정의 이행을 위한 관세법의 특례에 관한 법률',
  '대외무역법', '외국환거래법', '수출용원재료에대한관세등환급에관한특례법',

  // 행정
  '행정절차법', '행정기본법', '행정심판법', '행정소송법',
  '민원 처리에 관한 법률', '공공기관의 정보공개에 관한 법률',

  // 공무원
  '국가공무원법', '지방공무원법', '공무원연금법', '공무원보수규정',
  '공무원임용령', '공무원징계령',

  // 세법
  '국세기본법', '소득세법', '법인세법', '부가가치세법',
  '상속세 및 증여세법', '종합부동산세법', '지방세법',

  // 민사
  '민법', '상법', '민사소송법', '민사집행법',
  '주택임대차보호법', '상가건물 임대차보호법',

  // 노동
  '근로기준법', '최저임금법', '노동조합 및 노동관계조정법',
  '산업안전보건법', '산업재해보상보험법',

  // 형사
  '형법', '형사소송법', '도로교통법',

  // 공공기관/계약
  '국가를 당사자로 하는 계약에 관한 법률',
  '지방자치단체를 당사자로 하는 계약에 관한 법률',
  '공공기관의 운영에 관한 법률',
]

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

// 일반적인 질문 패턴 생성
function generateAiQuestions(keyword: string): string[] {
  const patterns = [
    `${keyword}이란?`,
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
  const query = searchParams.get('q')?.trim().toLowerCase() || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20)

  if (!query || query.length < 1) {
    return NextResponse.json({ suggestions: [] })
  }

  const suggestions: Suggestion[] = []

  // 1. 법령명 매칭
  for (const law of POPULAR_LAWS) {
    if (law.toLowerCase().includes(query)) {
      // 시작 위치에 따른 점수 (앞에서 매칭될수록 높은 점수)
      const matchIndex = law.toLowerCase().indexOf(query)
      const score = 100 - matchIndex + (law.startsWith(query) ? 50 : 0)

      suggestions.push({
        text: law,
        type: 'law',
        category: '법령',
        score
      })
    }
  }

  // 2. AI 질문 템플릿 매칭
  for (const [keyword, questions] of Object.entries(AI_QUESTION_TEMPLATES)) {
    if (keyword.includes(query) || query.includes(keyword)) {
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
