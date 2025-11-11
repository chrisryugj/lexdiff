/**
 * RAG Analysis API
 * 수집된 소스 데이터를 바탕으로 AI 분석을 수행하고 스트리밍 응답
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { ragSessionStore } from '@/lib/rag-session-store'
import type { RAGSession } from '@/lib/rag-session-store'
import { filterMultipleSources, logFilterResults } from '@/lib/rag-content-filter'

export async function POST(request: Request) {
  try {
    const { sessionId, userQuery } = await request.json()

    if (!sessionId) {
      return Response.json({ error: 'Session ID is required' }, { status: 400 })
    }

    // 세션 로드
    const session = await ragSessionStore.getSession(sessionId)

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // 사용자 쿼리 (후속 질문인 경우)
    const query = userQuery || session.originalQuery

    // 사용자 메시지 추가
    await ragSessionStore.addMessage(sessionId, {
      role: 'user',
      content: query,
      timestamp: Date.now(),
    })

    // 프롬프트 구성
    const prompt = buildRAGPrompt(session, query)

    // Gemini API 초기화
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    // 스트리밍 생성
    const result = await model.generateContentStream(prompt)

    // Server-Sent Events (SSE) 스트리밍
    const encoder = new TextEncoder()
    let fullResponse = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text()
            fullResponse += text

            // 청크 전송
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }

          // AI 응답 저장
          await ragSessionStore.addMessage(sessionId, {
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now(),
          })

          // 분석 카운트 증가
          await ragSessionStore.incrementAnalysisCount(sessionId)

          // 완료 시그널
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('RAG analysis error:', error)
    return Response.json(
      {
        error: 'Failed to analyze',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * RAG 프롬프트 구성
 */
function buildRAGPrompt(session: RAGSession, userQuery: string): string {
  // 1. 키워드 추출 (intent의 키워드 사용)
  const keywords: string[] = []
  session.intent.targets.forEach((target) => {
    if (target.keywords) {
      keywords.push(...target.keywords)
    }
  })

  // 사용자 쿼리에서도 키워드 추출 (간단한 로직)
  const queryWords = userQuery
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .filter((word) => !['이다', '있다', '없다', '해줘', '알려줘', '비교', '분석'].includes(word))

  keywords.push(...queryWords)

  // 중복 제거
  const uniqueKeywords = Array.from(new Set(keywords))

  console.log(`🔑 [Keywords for filtering] ${uniqueKeywords.join(', ')}`)

  // 2. 소스 필터링 (스마트하게 관련 조문만 추출)
  const filteredSources = filterMultipleSources(session.sources, uniqueKeywords, {
    maxArticles: 30,
    maxContentLength: 15000,
    includeTableOfContents: true,
  })

  // 필터 결과 로깅
  logFilterResults(filteredSources)

  // 3. 소스 데이터 컨텍스트 구성
  const sourcesContext = filteredSources
    .map(
      (filtered, index) => `
## 소스 ${index + 1}: ${filtered.source.title}

**메타데이터**:
- 종류: ${getSourceTypeLabel(filtered.source.type)}
${filtered.source.metadata.region ? `- 지역: ${filtered.source.metadata.region}` : ''}
${filtered.source.metadata.lawId ? `- 법령ID: ${filtered.source.metadata.lawId}` : ''}
- 전체 조문 수: ${filtered.source.metadata.totalArticles}개
- 포함된 조문: ${filtered.includedArticles.length}개 (${filtered.filterMethod} 방식)
${filtered.excludedCount > 0 ? `- 제외된 조문: ${filtered.excludedCount}개` : ''}
- 수집 시각: ${new Date(filtered.source.metadata.collectedAt).toLocaleString('ko-KR')}

**내용**:
\`\`\`
${filtered.filteredContent}
\`\`\`
`
    )
    .join('\n\n---\n\n')

  // 2. 대화 히스토리 (최근 5개만)
  const recentHistory = session.chatHistory.slice(-5)
  const chatContext =
    recentHistory.length > 0
      ? `\n\n# 이전 대화\n\n${recentHistory
          .map((msg) => `**${msg.role === 'user' ? '사용자' : 'AI'}**: ${msg.content}`)
          .join('\n\n')}`
      : ''

  // 3. 분석 지침
  const guidelines = getAnalysisGuidelines(session.intent.analysisType)

  // 4. 프롬프트 조합
  return `
당신은 법령 분석 전문가입니다. 제공된 소스 자료를 바탕으로 사용자의 질문에 답변하세요.

# 제공된 소스 자료

${sourcesContext}
${chatContext}

# 사용자 질문

"${userQuery}"

# 분석 지침

${guidelines}

# 응답 형식

마크다운 형식으로 구조화된 분석 결과를 제공하세요.

- 명확한 제목과 소제목 사용
- 표를 활용한 비교 (가능한 경우)
- 중요한 조문은 인용
- 객관적이고 전문적인 톤 유지
- 근거를 명시 (어느 소스의 어느 조문 참조)

**중요**: 제공된 소스 자료에만 근거하여 답변하세요. 추측이나 외부 정보는 사용하지 마세요.
`
}

/**
 * 소스 타입 라벨
 */
function getSourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    law: '법률',
    ordinance: '조례',
    decree: '시행령',
    rule: '시행규칙',
  }
  return labels[type] || type
}

/**
 * 분석 유형별 가이드라인
 */
function getAnalysisGuidelines(analysisType: string): string {
  switch (analysisType) {
    case 'comparative':
      return `
1. 각 법령/조례의 목적과 취지 비교
2. 주요 정의 및 용어 비교
3. 적용 대상 및 범위 비교
4. 핵심 내용 및 조항 비교
5. 절차 및 방법 비교 (있는 경우)
6. 예산 및 재원 비교 (있는 경우)
7. 특징적인 조항 및 차별화 포인트
8. 종합 평가 및 시사점

**비교표 예시**:
| 항목 | 소스 1 | 소스 2 |
|------|--------|--------|
| 목적 | ... | ... |
| 지원대상 | ... | ... |
`

    case 'explanatory':
      return `
1. 법령의 제정 목적 및 배경
2. 주요 내용 요약
3. 핵심 조항 설명
4. 적용 대상 및 범위
5. 절차 및 방법
6. 관련 법령 (있는 경우)
7. 실무적 시사점
`

    case 'summary':
      return `
1. 핵심 내용 요약 (3-5문장)
2. 주요 조항 리스트
3. 적용 대상
4. 중요 포인트
`

    default:
      return '사용자 질문에 최선을 다해 답변하세요.'
  }
}
