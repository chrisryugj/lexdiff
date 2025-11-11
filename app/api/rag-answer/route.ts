/**
 * RAG Answer Generation API
 *
 * 검색된 조문들을 컨텍스트로 사용하여
 * Gemini API로 사용자 질문에 대한 답변을 생성합니다.
 *
 * POST /api/rag-answer
 * Body: { query, context, options? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

interface ContextArticle {
  lawName: string
  articleDisplay: string
  articleContent: string
  similarity: number
}

interface RequestBody {
  query: string
  context: ContextArticle[]
  options?: {
    temperature?: number
    maxTokens?: number
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 1. 요청 파싱
    const body: RequestBody = await request.json()
    const { query, context, options = {} } = body

    if (!query || !context || context.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query and context are required' },
        { status: 400 }
      )
    }

    console.log('🤖 RAG Answer Generation:', { query, contextArticles: context.length })

    // 2. 컨텍스트 문자열 생성
    const contextText = context
      .map(
        (c, i) =>
          `[${i + 1}] ${c.lawName} ${c.articleDisplay} (유사도: ${(c.similarity * 100).toFixed(1)}%)\n${c.articleContent}`
      )
      .join('\n\n---\n\n')

    // 3. Gemini 프롬프트 구성
    const prompt = `당신은 대한민국 법령 전문가입니다. 사용자의 질문에 대해 제공된 법령 조문을 근거로 정확하고 명확한 답변을 제공하세요.

**사용자 질문**:
${query}

**관련 법령 조문**:
${contextText}

**답변 작성 지침**:
1. 질문에 직접적으로 답변하세요
2. 관련 법령 조문을 인용하며 설명하세요 (예: "관세법 제38조에 따르면...")
3. 번호나 목록으로 정리하여 읽기 쉽게 작성하세요
4. 법률 용어는 일반인도 이해할 수 있도록 부연 설명을 추가하세요
5. 확실하지 않은 내용은 추측하지 말고 "명시되어 있지 않습니다"라고 답하세요
6. 답변은 한국어로 작성하세요

답변을 작성해주세요:`

    // 4. Gemini API 호출
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: options.temperature || 0.3,
        maxOutputTokens: options.maxTokens || 2048,
      },
    })

    const result = await model.generateContent(prompt)
    const response = result.response
    const answerText = response.text()

    console.log(`  ✓ Answer generated: ${response.usageMetadata?.totalTokenCount || 0} tokens`)

    // 5. 인용 조문 추출 (간단한 휴리스틱)
    const citations = context
      .filter((c) => {
        // 답변에 법령명이 언급되었는지 확인
        return answerText.includes(c.lawName) || answerText.includes(c.articleDisplay)
      })
      .map((c) => ({
        lawName: c.lawName,
        articleDisplay: c.articleDisplay,
        relevance: (c.similarity > 0.85 ? 'high' : c.similarity > 0.7 ? 'medium' : 'low') as
          | 'high'
          | 'medium'
          | 'low',
      }))

    // 6. 신뢰도 평가
    const avgSimilarity = context.reduce((sum, c) => sum + c.similarity, 0) / context.length
    const confidence = (avgSimilarity > 0.85
      ? 'high'
      : avgSimilarity > 0.7
        ? 'medium'
        : 'low') as 'high' | 'medium' | 'low'

    console.log(`  ✓ Confidence: ${confidence}, Citations: ${citations.length}`)

    // 7. 응답 반환
    return NextResponse.json({
      success: true,
      answer: {
        content: answerText,
        citations,
        confidence,
      },
      metadata: {
        model: 'gemini-2.0-flash-exp',
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        executionTimeMs: Date.now() - startTime,
        contextArticles: context.length,
      },
    })
  } catch (error) {
    console.error('❌ RAG answer generation error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
