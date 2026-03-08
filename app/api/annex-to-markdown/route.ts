import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { isHwpxFile, isOldHwpFile, parseHwpxToMarkdown } from "@/lib/hwpx-parser"
import { getUsageHeaders, isQuotaExceeded, recordAITokens, recordAIUsage } from "@/lib/usage-tracker"
import { validateExternalUrl } from "@/lib/url-validator"

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()

  const realIP = request.headers.get("x-real-ip")
  if (realIP) return realIP

  return "127.0.0.1"
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

function buildPdfPrompt(lawName?: string, annexNumber?: string) {
  return `다음 PDF는 ${lawName || "법령"}의 ${annexNumber || "별표"}입니다.

한국어 마크다운으로만 변환하세요.
- 표는 가능한 한 마크다운 표 형식으로 유지합니다.
- 제목, 항목 번호, 들여쓰기 구조를 보존합니다.
- 페이지 번호나 반복 머리글은 제거합니다.
- 설명 문장 없이 변환 결과만 출력합니다.`
}

export async function POST(request: Request) {
  const clientIP = getClientIP(request)

  try {
    const { pdfUrl, annexNumber, lawName } = await request.json()

    if (!pdfUrl) {
      return NextResponse.json({ error: "pdfUrl is required." }, { status: 400 })
    }

    const baseUrl = getBaseUrl(request)
    const fullPdfUrl = pdfUrl.startsWith("/") ? `${baseUrl}${pdfUrl}` : pdfUrl

    if (!fullPdfUrl.startsWith(baseUrl) && !validateExternalUrl(fullPdfUrl)) {
      return NextResponse.json({ error: "허용되지 않은 URL입니다." }, { status: 400 })
    }

    debugLogger.info("Annex conversion requested", { annexNumber, lawName, fullPdfUrl })

    const fileResponse = await fetch(fullPdfUrl)
    if (!fileResponse.ok) {
      throw new Error(`파일 다운로드 실패: ${fileResponse.status}`)
    }

    const fileBuffer = await fileResponse.arrayBuffer()
    const isHwpx = isHwpxFile(fileBuffer)
    const isOldHwp = isOldHwpFile(fileBuffer)

    if (isOldHwp) {
      return NextResponse.json(
        {
          error: "구형 HWP 파일은 다운로드 후 별도 뷰어로 열어 주세요.",
          fileType: "old-hwp",
        },
        { status: 400 }
      )
    }

    if (isHwpx) {
      const parseResult = await parseHwpxToMarkdown(fileBuffer)
      if (!parseResult.success || !parseResult.markdown) {
        throw new Error(parseResult.error || "HWPX 파싱 실패")
      }

      return NextResponse.json({
        markdown: parseResult.markdown,
        source: "hwpx-parser",
        meta: parseResult.meta,
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      debugLogger.error("GEMINI_API_KEY is missing")
      return NextResponse.json(
        { error: "AI 서비스가 설정되지 않았습니다." },
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

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: Buffer.from(fileBuffer).toString("base64"),
          },
        },
        {
          text: buildPdfPrompt(lawName, annexNumber),
        },
      ],
    })

    const markdown = response.text
    if (!markdown || markdown.length < 10) {
      throw new Error("마크다운 변환 결과가 비어 있습니다.")
    }

    await recordAITokens(clientIP, markdown.length)

    debugLogger.success("Annex conversion complete", {
      annexNumber,
      markdownLength: markdown.length,
    })

    return NextResponse.json({
      markdown,
      source: "gemini-vision",
    })
  } catch (error) {
    debugLogger.error("Annex conversion failed", error)
    return NextResponse.json(
      {
        error: "별표 변환 중 오류가 발생했습니다.",
        markdown: null,
        source: "error",
      },
      { status: 500 }
    )
  }
}
