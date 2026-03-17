import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { getUsageHeaders, isQuotaExceeded, recordAITokens, recordAIUsage } from "@/lib/usage-tracker"
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/fc-rag/anthropic-client"

function sanitizePromptInput(text: string): string {
  return text.replace(/"""/g, '"').replace(/```/g, "").substring(0, 8000)
}

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()

  const realIP = request.headers.get("x-real-ip")
  if (realIP) return realIP

  return "127.0.0.1"
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

export async function POST(request: Request) {
  const clientIP = getClientIP(request)

  try {
    const contentLength = Number(request.headers.get("content-length") || "0")
    if (contentLength > 200_000) {
      return NextResponse.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 })
    }

    const { lawTitle, joNum, oldContent, newContent, effectiveDate, isPrecedent } = await request.json()

    if (!isPrecedent && (!oldContent || !newContent)) {
      return NextResponse.json({ error: "구법과 신법 본문이 모두 필요합니다." }, { status: 400 })
    }

    if (isPrecedent && !newContent) {
      return NextResponse.json({ error: "판례 본문이 필요합니다." }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      debugLogger.error("GEMINI_API_KEY is missing")
      return NextResponse.json(
        { error: "AI 서비스가 설정되지 않았습니다. GEMINI_API_KEY를 확인해 주세요." },
        { status: 500 }
      )
    }

    if (await isQuotaExceeded(clientIP)) {
      return NextResponse.json(
        { error: "일일 AI 사용 시도를 초과했습니다." },
        { status: 429, headers: await getUsageHeaders(clientIP) }
      )
    }

    await recordAIUsage(clientIP)

    debugLogger.info("AI summary request", { lawTitle, joNum, effectiveDate, isPrecedent })

    const prompt = buildPrompt({
      lawTitle,
      joNum,
      oldContent,
      newContent,
      effectiveDate,
      isPrecedent,
    })

    // 1) Claude 우선 시도
    try {
      const client = getAnthropicClient()
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      })
      const claudeText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
      if (claudeText) {
        await recordAITokens(clientIP, claudeText.length)
        debugLogger.success("AI summary complete (Claude)", { length: claudeText.length })
        return NextResponse.json({ summary: claudeText.trim() })
      }
    } catch (err) {
      debugLogger.warning("Claude summarize failed, falling back to Gemini", err)
    }

    // 2) Gemini 폴백
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    })

    const summary = response.text
    await recordAITokens(clientIP, summary?.length ?? 0)

    debugLogger.success("AI summary complete (Gemini)", { length: summary?.length ?? 0 })
    return NextResponse.json({ summary })
  } catch (error) {
    debugLogger.error("AI summary failed", error)
    return NextResponse.json(
      { error: "AI 요약 생성 중 오류가 발생했습니다." },
      { status: 500 }
    )
  }
}
