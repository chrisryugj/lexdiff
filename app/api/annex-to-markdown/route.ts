import { NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { debugLogger } from "@/lib/debug-logger"
import { parseHwpxToMarkdown, isHwpxFile, isOldHwpFile } from "@/lib/hwpx-parser"

/**
 * 별표 파일 → 마크다운 변환 API
 * - HWPX (신 한글): 직접 파싱 (빠르고 정확)
 * - 구 HWP (OLE2): hwp.js로 파싱 시도
 * - PDF: Gemini Vision API 사용
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

    debugLogger.info("별표 파일→마크다운 변환 시작", { annexNumber, lawName })

    // 파일 다운로드 (내부 프록시 또는 외부 URL)
    const fullPdfUrl = pdfUrl.startsWith("/")
      ? `${getBaseUrl(request)}${pdfUrl}`
      : pdfUrl

    const fileResponse = await fetch(fullPdfUrl)
    if (!fileResponse.ok) {
      throw new Error(`파일 다운로드 실패: ${fileResponse.status}`)
    }

    const fileBuffer = await fileResponse.arrayBuffer()
    debugLogger.info("파일 다운로드 완료", { size: fileBuffer.byteLength })

    // 파일 타입 확인 (HWPX vs 구 HWP vs PDF)
    const isHwpx = isHwpxFile(fileBuffer)
    const isOldHwp = isOldHwpFile(fileBuffer)

    if (isOldHwp) {
      // 구 HWP 파일: hwp.js로 파싱 시도
      debugLogger.info("구 HWP 파일 감지, hwp.js로 파싱 시도", { annexNumber })

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const hwpjs = require("hwp.js")
        const parse = hwpjs.parse

        const buffer = Buffer.from(fileBuffer)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hwpDoc: any = parse(buffer, { type: "buffer" })

        if (!hwpDoc.sections || hwpDoc.sections.length === 0) {
          throw new Error("HWP 문서에 내용이 없습니다")
        }

        // 재귀적으로 텍스트 추출
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extractTextFromContent = (content: any[]): string => {
          let text = ""
          for (const item of content) {
            if (item.value !== undefined && typeof item.value === "string") {
              text += item.value
            }
            if (item.content && Array.isArray(item.content)) {
              text += extractTextFromContent(item.content)
            }
          }
          return text
        }

        const lines: string[] = []
        for (const section of hwpDoc.sections) {
          const paragraphs = section.content || []
          for (const paragraph of paragraphs) {
            const content = paragraph.content || []
            const paragraphText = extractTextFromContent(content)
            if (paragraphText.trim()) {
              lines.push(paragraphText.trim())
            }
          }
        }

        if (lines.length === 0) {
          // 텍스트 추출 실패 (표 형식 문서)
          debugLogger.warn("구 HWP 텍스트 추출 실패 - 표 형식 문서", { annexNumber })
          return NextResponse.json(
            {
              error: "표 형식 HWP 문서는 텍스트 추출이 제한적입니다. 다운로드하여 확인해주세요.",
              fileType: "old-hwp",
            },
            { status: 400 }
          )
        }

        const markdown = lines.join("\n\n")
        debugLogger.success("구 HWP→마크다운 변환 완료", {
          annexNumber,
          markdownLength: markdown.length,
          paragraphs: lines.length,
        })

        return NextResponse.json({
          markdown,
          source: "hwp-js",
        })
      } catch (hwpError) {
        debugLogger.warn("구 HWP 파싱 실패, 다운로드만 제공", {
          annexNumber,
          error: hwpError instanceof Error ? hwpError.message : "알 수 없는 에러",
        })
        return NextResponse.json(
          {
            error: "구 HWP 파일 파싱에 실패했습니다. 다운로드하여 한컴오피스로 열어주세요.",
            fileType: "old-hwp",
          },
          { status: 400 }
        )
      }
    }

    if (isHwpx) {
      // HWPX 파일: 직접 파싱
      debugLogger.info("HWPX 파일 감지, 직접 파싱 시작")

      const parseResult = await parseHwpxToMarkdown(fileBuffer)

      if (!parseResult.success || !parseResult.markdown) {
        throw new Error(parseResult.error || "HWPX 파싱 실패")
      }

      debugLogger.success("HWPX→마크다운 변환 완료", {
        annexNumber,
        markdownLength: parseResult.markdown.length,
        meta: parseResult.meta,
      })

      return NextResponse.json({
        markdown: parseResult.markdown,
        source: "hwpx-parser",
        meta: parseResult.meta,
      })
    }

    // PDF 파일: Gemini Vision API 사용
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      debugLogger.error("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다")
      return NextResponse.json(
        { error: "AI 서비스가 설정되지 않았습니다" },
        { status: 500 }
      )
    }

    debugLogger.info("PDF 파일 감지, Gemini Vision API 사용")

    const pdfBase64 = Buffer.from(fileBuffer).toString("base64")

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
