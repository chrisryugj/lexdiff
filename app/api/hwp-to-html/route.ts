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

    // 2. hwp.js로 파싱 (서버사이드)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const HWPDocument = require("hwp.js").default

    const hwpDoc = new HWPDocument(arrayBuffer)
    const sections = hwpDoc.sections()

    if (!sections || sections.length === 0) {
      throw new Error("HWP 문서에 내용이 없습니다")
    }

    // 3. HTML로 변환
    let html = '<div class="hwp-document">'

    for (const section of sections) {
      html += '<div class="hwp-section">'

      const paragraphs = section.paragraphs || []
      for (const paragraph of paragraphs) {
        const text = paragraph.text || ""
        if (text.trim()) {
          // 텍스트를 HTML로 변환 (줄바꿈 처리)
          const escapedText = text
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

    debugLogger.success("[hwp-to-html] HWP 변환 완료", {
      sections: sections.length,
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
