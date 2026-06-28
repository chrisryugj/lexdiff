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

인사말·역할 소개·서론 없이, 곧바로 아래 형식의 본문부터 작성하세요.
마크다운으로 작성하고 각 섹션 제목은 ## 를 사용하세요.

## 핵심 쟁점
## 판시 요지
## 실무 시사점
## 관련 법조문

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

사용자에게는 구법→신법의 정확한 신·구 대조(어떤 문구가 삭제·추가됐는지)가 이미 별도로 제공됩니다.
따라서 바뀐 문구를 그대로 나열하지 말고, 그 변경이 가지는 의미를 해설하는 데 집중하세요.
인사말·역할 소개·"분석해 드립니다" 같은 서론 없이, 곧바로 아래 형식의 본문부터 작성하세요.
마크다운으로 작성하고 각 섹션 제목은 ## 를 사용하세요.

## 한 줄 요약
이번 개정의 핵심을 한 문장으로 요약하세요.

## 실무 해설
개정의 취지와 실무에 미치는 영향을 2~4개의 간결한 항목으로 설명하세요.
단순 변경 나열이 아니라 '왜 바뀌었고, 그래서 무엇이 달라지는지'에 초점을 두고,
원문 근거가 없는 추측은 하지 마세요.`
}

export async function POST(request: NextRequest) {
  // 쿼터 사전 차감 (BYOK 시 no-op). 실패 시 refundAiQuota로 환불.
  const auth = await requireAiAuth(request, 'summarize')
  if ('error' in auth) return auth.error
  const authCtx = auth.ctx

  const startMs = Date.now()

  // ── 입력 파싱·검증 (스트림 시작 전; 에러는 일반 JSON 응답) ──
  const contentLength = Number(request.headers.get("content-length") || "0")
  if (contentLength > 200_000) {
    await refundAiQuota(authCtx)
    return NextResponse.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 })
  }

  let lawTitle: string | undefined
  let joNum: string | undefined
  let oldContent: string | undefined
  let newContent: string | undefined
  let effectiveDate: string | undefined
  let isPrecedent: boolean | undefined
  try {
    const body = await request.json()
    lawTitle = body.lawTitle
    joNum = body.joNum
    oldContent = body.oldContent
    newContent = body.newContent
    effectiveDate = body.effectiveDate
    isPrecedent = body.isPrecedent
  } catch {
    await refundAiQuota(authCtx)
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }

  const isPrecedentFlag = Boolean(isPrecedent)
  const oldLen = typeof oldContent === 'string' ? oldContent.length : 0
  const newLen = typeof newContent === 'string' ? newContent.length : 0

  if (!isPrecedent && (!oldContent || !newContent)) {
    await refundAiQuota(authCtx)
    return NextResponse.json({ error: "구법과 신법 본문이 모두 필요합니다." }, { status: 400 })
  }
  if (isPrecedent && !newContent) {
    await refundAiQuota(authCtx)
    return NextResponse.json({ error: "판례 본문이 필요합니다." }, { status: 400 })
  }

  const apiKey = resolveGeminiKey(authCtx)
  if (!apiKey) {
    debugLogger.error("GEMINI_API_KEY is missing")
    await refundAiQuota(authCtx)
    return NextResponse.json({ error: "AI 서비스를 사용할 수 없습니다." }, { status: 500 })
  }

  debugLogger.info("AI summary request", { lawTitle, joNum, effectiveDate, isPrecedent })

  const prompt = buildPrompt({
    lawTitle: lawTitle || "",
    joNum,
    oldContent,
    newContent: newContent || "",
    effectiveDate,
    isPrecedent,
  })
  const modelIdActual = AI_CONFIG.gemini.lite

  // ── 토큰 스트리밍 (SSE) — 답변을 generateContentStream으로 실시간 전송 ──
  const ai = new GoogleGenAI({ apiKey })
  const encoder = new TextEncoder()

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = ""
      let inputTokens: number | null = null
      let outputTokens: number | null = null
      let errorCategory: ErrorCategory | null = null
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        const stream = await ai.models.generateContentStream({ model: modelIdActual, contents: prompt })
        for await (const chunk of stream) {
          const text = chunk.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("") ?? ""
          if (text) {
            full += text
            send({ type: "token", text })
          }
          const usage = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
          if (usage) {
            inputTokens = usage.promptTokenCount ?? inputTokens
            outputTokens = usage.candidatesTokenCount ?? outputTokens
          }
        }
        if (!full) throw new Error("empty summary response")
        send({ type: "done" })
        debugLogger.success("AI summary complete (Gemini stream)", { length: full.length })
      } catch (error) {
        errorCategory = categorizeError(error)
        // Gemini 에러 객체에 사용자 API 키가 echo될 가능성 차단 — 원문은 서버 로그로만.
        debugLogger.error("AI summary failed", error)
        send({ type: "error", message: "AI 요약 생성 중 오류가 발생했습니다." })
      } finally {
        // Serverless에서 fire-and-forget은 잘린다 → close 전에 await로 보장 (실패는 swallow).
        try {
          await recordTelemetry({
            endpoint: 'summarize',
            isByok: authCtx.isByok,
            sessionAnon: sessionAnonHash(authCtx.userId, authCtx.byokKey),
            uaClass: classifyUa(request.headers.get('user-agent')),
            lang: 'ko',
            queryType: isPrecedentFlag ? 'precedent_summary' : 'revision_summary',
            queryLengthBucket: bucketLength(Math.max(oldLen, newLen)),
            answerLengthBucket: bucketLength(full.length),
            latencyTotalMs: Date.now() - startMs,
            errorCategory,
            modelIdActual,
            inputTokens,
            outputTokens,
            costEstimateUsd: estimateCostUsd(modelIdActual, inputTokens, outputTokens),
          })
        } catch { /* telemetry failure swallowed */ }

        // 실패(에러/빈 답변)면 사전차감 쿼터 환불.
        if (errorCategory !== null || !full) {
          await refundAiQuota(authCtx)
        }
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
