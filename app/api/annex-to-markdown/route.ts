import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { parseAnnexFile } from "@/lib/annex-parser"
import { validateExternalUrl } from "@/lib/url-validator"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

function getBaseUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export async function POST(request: Request) {
  try {
    const { pdfUrl, annexNumber, lawName } = await request.json()

    if (!pdfUrl) {
      return NextResponse.json({ error: "pdfUrl is required." }, { status: 400 })
    }

    const baseUrl = getBaseUrl(request)
    const fullPdfUrl = pdfUrl.startsWith("/") ? `${baseUrl}${pdfUrl}` : pdfUrl

    // SSRF 방지: 허용된 경로만
    if (pdfUrl.startsWith("/")) {
      const allowedPrefixes = ["/api/annex-pdf"]
      if (!allowedPrefixes.some((p: string) => pdfUrl.startsWith(p))) {
        return NextResponse.json({ error: "허용되지 않은 내부 경로입니다." }, { status: 400 })
      }
    } else if (!validateExternalUrl(fullPdfUrl)) {
      return NextResponse.json({ error: "허용되지 않은 URL입니다." }, { status: 400 })
    }

    debugLogger.info("Annex conversion requested", { annexNumber, lawName, fullPdfUrl })

    const fileResponse = await fetchWithTimeout(fullPdfUrl)
    if (!fileResponse.ok) {
      throw new Error(`파일 다운로드 실패: ${fileResponse.status}`)
    }

    const fileBuffer = await fileResponse.arrayBuffer()

    // kordoc 통합 파서: HWPX, HWP5, PDF 모두 순수 파싱
    const result = await parseAnnexFile(fileBuffer)

    if (result.success) {
      debugLogger.success(`Annex parsed (${result.fileType})`, {
        annexNumber,
        markdownLength: result.markdown.length,
      })
      return NextResponse.json({
        markdown: result.markdown,
        source: `${result.fileType}-parser`,
      })
    }

    // result.success === false → error 필드 접근 가능
    if (result.fileType === "hwp") {
      return NextResponse.json({
        error: result.error || "구형 HWP 파일 파싱에 실패했습니다.",
        fileType: "old-hwp",
      }, { status: 400 })
    }

    if (result.isImageBased) {
      return NextResponse.json({
        error: result.error || "이미지 기반 PDF입니다. 텍스트 추출이 불가합니다.",
        fileType: "image-pdf",
      }, { status: 400 })
    }

    return NextResponse.json({
      error: result.error || "파일 파싱에 실패했습니다.",
      fileType: result.fileType,
    }, { status: 400 })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    debugLogger.error("Annex conversion failed", { error: errMsg })
    return NextResponse.json(
      {
        error: `별표 변환 중 오류: ${errMsg}`,
        markdown: null,
        source: "error",
      },
      { status: 500 }
    )
  }
}
