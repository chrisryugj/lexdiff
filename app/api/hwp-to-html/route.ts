import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

/**
 * HWP 파일을 HTML로 변환하는 API
 * hwp.js를 서버사이드에서 사용하여 파싱
 *
 * POST /api/hwp-to-html
 * Body: { hwpUrl: string }
 *
 * 반환: { success: boolean, html?: string, error?: string }
 *
 * ⚠️ 한계: hwp.js 라이브러리는 표 형식의 HWP 문서 텍스트 추출이 불완전함
 *    법제처 별표는 대부분 표 형식이라 텍스트 추출이 제한적
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { hwpUrl } = body

    if (!hwpUrl) {
      return NextResponse.json({ error: "hwpUrl이 필요합니다" }, { status: 400 })
    }

    debugLogger.info("[hwp-to-html] HWP 변환 시작", { hwpUrl })

    // 1. HWP 파일 다운로드
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    const fullUrl = hwpUrl.startsWith("/") ? `${baseUrl}${hwpUrl}` : hwpUrl

    const response = await fetch(fullUrl)
    if (!response.ok) {
      throw new Error(`HWP 파일 다운로드 실패: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 2. hwp.js로 파싱 (서버사이드)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hwpjs = require("hwp.js")
    const parse = hwpjs.parse

    // parse(data, options) - options.type: 'binary' | 'base64' | 'buffer'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hwpDoc: any = parse(buffer, { type: "buffer" })

    debugLogger.info("[hwp-to-html] HWP 파싱 완료", {
      keys: Object.keys(hwpDoc),
      sectionsCount: hwpDoc.sections?.length,
    })

    if (!hwpDoc.sections || hwpDoc.sections.length === 0) {
      throw new Error("HWP 문서에 내용이 없습니다")
    }

    // 3. HTML로 변환 - 텍스트 추출 시도
    let html = '<div class="hwp-document">'
    let hasContent = false

    // 재귀적으로 텍스트 추출
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function extractTextFromContent(content: any[]): string {
      let text = ""
      for (const item of content) {
        // 문자열 값 추출
        if (item.value !== undefined && typeof item.value === "string") {
          text += item.value
        }
        // 중첩된 content 처리
        if (item.content && Array.isArray(item.content)) {
          text += extractTextFromContent(item.content)
        }
      }
      return text
    }

    for (const section of hwpDoc.sections) {
      html += '<div class="hwp-section">'

      const paragraphs = section.content || []
      for (const paragraph of paragraphs) {
        const content = paragraph.content || []
        const paragraphText = extractTextFromContent(content)

        if (paragraphText.trim()) {
          hasContent = true
          const escapedText = paragraphText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>")

          html += `<p class="hwp-paragraph">${escapedText}</p>`
        }
      }

      html += "</div>"
    }

    html += "</div>"

    // 텍스트 추출 실패 시 (표 형식 문서 등)
    if (!hasContent) {
      debugLogger.warning("[hwp-to-html] HWP 텍스트 추출 실패 (표 형식 문서)")
      return NextResponse.json({
        success: false,
        error: "HWP 문서의 텍스트를 추출할 수 없습니다. 표 형식 문서는 지원되지 않습니다.",
        isTableDocument: true,
      })
    }

    debugLogger.success("[hwp-to-html] HWP 변환 완료", {
      sections: hwpDoc.sections.length,
      htmlLength: html.length,
    })

    return NextResponse.json({
      success: true,
      html,
    })
  } catch (error) {
    debugLogger.error("[hwp-to-html] HWP 변환 실패", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "HWP 변환 실패",
      },
      { status: 500 }
    )
  }
}
