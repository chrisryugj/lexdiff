import { NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { debugLogger } from "@/lib/debug-logger"

/**
 * 별표 PDF → 마크다운 변환 API
 * Gemini Vision API를 사용하여 PDF를 마크다운으로 변환
 *
 * POST /api/annex-to-markdown
 * Body: { pdfUrl, annexNumber, lawName }
 */
export async function POST(request: Request) {
  try {
    const { pdfUrl, annexNumber, lawName } = await request.json()

    if (!pdfUrl) {
      return NextResponse.json({ error: "pdfUrl이 필요합니다" }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      debugLogger.error("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다")
      return NextResponse.json(
        { error: "AI 서비스가 설정되지 않았습니다" },
        { status: 500 }
      )
    }

    debugLogger.info("별표 PDF→마크다운 변환 시작", { annexNumber, lawName })

    // PDF 다운로드 (내부 프록시 또는 외부 URL)
    const fullPdfUrl = pdfUrl.startsWith("/")
      ? `${getBaseUrl(request)}${pdfUrl}`
      : pdfUrl

    const pdfResponse = await fetch(fullPdfUrl)
    if (!pdfResponse.ok) {
      throw new Error(`PDF 다운로드 실패: ${pdfResponse.status}`)
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64")

    debugLogger.info("PDF 다운로드 완료", { size: pdfBuffer.byteLength })

    // Gemini Vision API로 PDF 분석
    const ai = new GoogleGenAI({ apiKey })

    const prompt = `이 PDF는 한국 법령 「${lawName || "법령"}」의 ${annexNumber || "별표"}입니다.

다음 지침에 따라 마크다운으로 변환해주세요:

## 변환 규칙

1. **표(Table)** - 가장 중요!
   - 반드시 마크다운 테이블 형식으로 정확히 변환
   - 셀 병합이 있는 경우 가능한 한 구조를 보존
   - 복잡한 표는 여러 개의 간단한 표로 분리 가능

2. **제목/소제목**
   - 문서 제목은 ## (h2)
   - 섹션 제목은 ### (h3)
   - 소섹션은 #### (h4)

3. **번호 리스트**
   - 1. 2. 3. 또는 가. 나. 다. 형식 그대로 유지
   - 들여쓰기 레벨 보존

4. **특수 표기**
   - 법령 참조 (제X조, 「법령명」 등)는 그대로 유지
   - 괄호 안 내용 보존
   - 비고, 주, 각주는 별도 섹션으로 분리

5. **제외 사항**
   - 불필요한 머리글/꼬리글 제거
   - 페이지 번호 제거
   - 빈 줄 최소화

## 출력 형식

마크다운만 출력하세요. 부가 설명 없이 변환된 내용만 반환하세요.`

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: pdfBase64,
          },
        },
        { text: prompt },
      ],
    })

    const markdown = response.text

    if (!markdown || markdown.length < 10) {
      throw new Error("마크다운 변환 결과가 비어있습니다")
    }

    debugLogger.success("별표 PDF→마크다운 변환 완료", {
      annexNumber,
      markdownLength: markdown.length,
    })

    return NextResponse.json({
      markdown,
      source: "gemini-vision",
    })
  } catch (error) {
    debugLogger.error("별표 PDF→마크다운 변환 실패", error)

    // 에러 메시지에 따른 분기
    const errorMessage = error instanceof Error ? error.message : "변환 실패"

    return NextResponse.json(
      {
        error: errorMessage,
        markdown: null,
        source: "error",
      },
      { status: 500 }
    )
  }
}

/**
 * 요청에서 기본 URL 추출
 */
function getBaseUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}
