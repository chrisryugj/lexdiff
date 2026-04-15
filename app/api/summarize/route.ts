import { GoogleGenAI } from "@google/genai"
import { NextResponse, type NextRequest } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { AI_CONFIG } from "@/lib/ai-config"
import { requireAiAuth, refundAiQuota, resolveGeminiKey } from "@/lib/api-auth"
import {
  recordTelemetry,
  bucketLength,
  classifyUa,
  sessionAnonHash,
  categorizeError,
  estimateCostUsd,
  type ErrorCategory,
} from "@/lib/ai-telemetry"

function sanitizePromptInput(text: string): string {
  return text.replace(/"""/g, '"').replace(/```/g, "").substring(0, 8000)
}

function buildPrompt(params: {
  lawTitle: string
  joNum?: string
  oldContent?: string
  newContent: string
  effectiveDate?: string
  isPrecedent?: boolean
}) {
  if (params.isPrecedent) {
    return `당신은 대한민국 법률 실무가를 위한 판례 요약 전문가입니다.

사건명: ${params.lawTitle}
${params.effectiveDate ? `선고일: ${params.effectiveDate}` : ""}

판결문 발췌:
"""
${sanitizePromptInput(params.newContent)}
"""

다음 형식으로 한국어로 답변하세요.
1. 핵심 쟁점
2. 판시 요지
3. 실무 시사점
4. 관련 법조문

각 항목은 짧고 명확하게 작성하고, 원문에 없는 내용은 추정하지 마세요.`
  }

  return `당신은 대한민국 법령 개정 비교 분석가입니다.

법령명: ${params.lawTitle}
${params.joNum ? `조문: ${params.joNum}` : ""}
${params.effectiveDate ? `시행일: ${params.effectiveDate}` : ""}

구법:
"""
${sanitizePromptInput(params.oldContent || "").substring(0, 3000)}
"""

신법:
"""
${sanitizePromptInput(params.newContent).substring(0, 3000)}
"""

다음 형식으로 한국어로 답변하세요.
1. 핵심 변경 요약
2. 실무 영향
3. 주요 변경사항 목록

각 변경사항은 무엇이 어떻게 바뀌었는지 명확하게 설명하고, 원문 근거가 없는 해석은 추가하지 마세요.`
}

export async function POST(request: NextRequest) {
  // 쿼터 사전 차감 (BYOK 시 no-op). 실패 시 finally에서 refund.
  const auth = await requireAiAuth(request, 'summarize')
  if ('error' in auth) return auth.error
  const authCtx = auth.ctx

  let succeeded = false
  const startMs = Date.now()
  let errorCategory: ErrorCategory | null = null
  let answerLen = 0
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let isPrecedentFlag = false
  let oldLen = 0
  let newLen = 0
  try {
    const contentLength = Number(request.headers.get("content-length") || "0")
    if (contentLength > 200_000) {
      return NextResponse.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 })
    }

    const { lawTitle, joNum, oldContent, newContent, effectiveDate, isPrecedent } = await request.json()
    isPrecedentFlag = Boolean(isPrecedent)
    oldLen = typeof oldContent === 'string' ? oldContent.length : 0
    newLen = typeof newContent === 'string' ? newContent.length : 0

    if (!isPrecedent && (!oldContent || !newContent)) {
      return NextResponse.json({ error: "구법과 신법 본문이 모두 필요합니다." }, { status: 400 })
    }

    if (isPrecedent && !newContent) {
      return NextResponse.json({ error: "판례 본문이 필요합니다." }, { status: 400 })
    }

    const apiKey = resolveGeminiKey(authCtx)
    if (!apiKey) {
      debugLogger.error("GEMINI_API_KEY is missing")
      return NextResponse.json(
        { error: "AI 서비스를 사용할 수 없습니다." },
        { status: 500 }
      )
    }

    debugLogger.info("AI summary request", { lawTitle, joNum, effectiveDate, isPrecedent })

    const prompt = buildPrompt({
      lawTitle,
      joNum,
      oldContent,
      newContent,
      effectiveDate,
      isPrecedent,
    })

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: AI_CONFIG.gemini.lite,
      contents: prompt,
    })

    const summary = response.text
    if (!summary) {
      throw new Error('empty summary response')
    }

    const usage = (response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
    inputTokens = usage?.promptTokenCount ?? null
    outputTokens = usage?.candidatesTokenCount ?? null
    answerLen = summary.length

    succeeded = true
    debugLogger.success("AI summary complete (Gemini)", { length: summary.length })
    return NextResponse.json({ summary })
  } catch (error) {
    errorCategory = categorizeError(error)
    // Gemini 에러 객체에 사용자 API 키가 echo될 가능성 차단 — 원문 메시지는 서버 로그로만.
    debugLogger.error("AI summary failed", error)
    return NextResponse.json(
      { error: "AI 요약 생성 중 오류가 발생했습니다." },
      { status: 500 }
    )
  } finally {
    // Serverless에서 fire-and-forget은 응답 후 잘린다 → await 필수 (실패는 swallow).
    try {
      const modelIdActual = AI_CONFIG.gemini.lite
      await recordTelemetry({
        endpoint: 'summarize',
        isByok: authCtx.isByok,
        sessionAnon: sessionAnonHash(authCtx.userId, authCtx.byokKey),
        uaClass: classifyUa(request.headers.get('user-agent')),
        lang: 'ko',
        queryType: isPrecedentFlag ? 'precedent_summary' : 'revision_summary',
        queryLengthBucket: bucketLength(Math.max(oldLen, newLen)),
        answerLengthBucket: bucketLength(answerLen),
        latencyTotalMs: Date.now() - startMs,
        errorCategory,
        modelIdActual,
        inputTokens,
        outputTokens,
        costEstimateUsd: estimateCostUsd(modelIdActual, inputTokens, outputTokens),
      })
    } catch { /* telemetry failure swallowed */ }

    if (!succeeded) {
      await refundAiQuota(authCtx)
    }
  }
}
