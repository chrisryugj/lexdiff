/**
 * Intent Analysis API
 * Gemini를 사용하여 사용자 질문의 의도를 분석하고 필요한 데이터를 식별
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AnalysisIntent } from '@/lib/intent-analyzer'

export async function POST(request: Request) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Query is required' }, { status: 400 })
    }

    // Gemini API 초기화
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    // 프롬프트 구성
    const prompt = buildIntentAnalysisPrompt(query)

    // Gemini 호출
    const result = await model.generateContent(prompt)
    const response = result.response
    const text = response.text()

    // JSON 파싱
    const intent = parseIntentResponse(text)

    return Response.json({
      success: true,
      intent,
    })
  } catch (error) {
    console.error('Intent analysis error:', error)
    return Response.json(
      {
        error: 'Failed to analyze intent',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Intent 분석을 위한 프롬프트 생성
 */
function buildIntentAnalysisPrompt(query: string): string {
  return `
당신은 법령 검색 의도 분석 전문가입니다.

사용자 질문: "${query}"

질문을 분석하여 다음 정보를 JSON으로 추출하세요:

1. **intent**: 사용자의 주요 의도
   - "compare_laws": 여러 법령 비교
   - "explain_law": 특정 법령 설명
   - "find_related": 관련 법령 찾기
   - "summarize": 법령 요약
   - "general_question": 일반 질문

2. **targets**: 필요한 데이터 목록
   각 항목:
   - type: "law" (법률), "ordinance" (조례), "decree" (시행령), "rule" (시행규칙)
   - identifier: 명확한 법령명 (있는 경우)
   - region: 지역명 (조례인 경우, 예: "광진구", "성동구")
   - keywords: 검색에 필요한 키워드 배열 (예: ["4차산업", "진흥"])
   - confidence: 0~1 (이 데이터가 필요한 확신도)

3. **analysisType**: 분석 유형
   - "comparative": 비교 분석
   - "explanatory": 설명
   - "summary": 요약
   - "general": 일반 답변

4. **focusAreas**: 분석 시 집중할 영역 (선택사항)
   예: ["목적", "지원대상", "지원내용", "예산"]

5. **additionalContext**: 추가 컨텍스트 (선택사항)

# 응답 예시

사용자 질문: "광진구와 성동구의 4차산업 관련 조례를 분석, 비교해줘"

\`\`\`json
{
  "intent": "compare_laws",
  "targets": [
    {
      "type": "ordinance",
      "region": "광진구",
      "keywords": ["4차산업", "산업진흥", "혁신"],
      "confidence": 0.95
    },
    {
      "type": "ordinance",
      "region": "성동구",
      "keywords": ["4차산업", "산업진흥", "혁신"],
      "confidence": 0.95
    }
  ],
  "analysisType": "comparative",
  "focusAreas": ["목적", "정의", "지원대상", "지원내용", "예산", "시행일"]
}
\`\`\`

# 중요 지침

- JSON만 응답하세요 (추가 설명 없이)
- 키워드는 검색 가능성을 높이도록 다양하게 제시
- 지역명은 정확하게 추출 ("광진구", "성동구" 등)
- 조례는 type을 "ordinance"로 설정
- 법률은 type을 "law"로 설정

이제 실제 사용자 질문을 분석하고 JSON만 응답하세요.
`
}

/**
 * Gemini 응답을 파싱하여 AnalysisIntent 객체로 변환
 */
function parseIntentResponse(text: string): AnalysisIntent {
  // JSON 코드 블록 제거 (```json ... ``` 형태)
  let cleanText = text.trim()

  // 코드 블록 마커 제거
  cleanText = cleanText.replace(/```json\s*/g, '')
  cleanText = cleanText.replace(/```\s*/g, '')

  // JSON 파싱
  try {
    const parsed = JSON.parse(cleanText)
    return parsed as AnalysisIntent
  } catch (error) {
    console.error('Failed to parse intent response:', text)
    throw new Error('Invalid JSON response from Gemini')
  }
}
