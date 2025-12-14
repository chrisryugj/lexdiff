import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

/**
 * 별표 파일 프록시 API
 * CORS 우회를 위해 법제처 파일(PDF/HWP)를 프록시로 제공
 *
 * GET /api/annex-pdf?flSeq={파일일련번호}
 * - flSeq: 법제처 파일 일련번호 (필수)
 *
 * 반환:
 * - PDF 파일인 경우: application/pdf
 * - HWP 파일인 경우: application/hwp+zip (다운로드용)
 * - 기타 파일: application/octet-stream
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const flSeq = searchParams.get("flSeq")

  if (!flSeq) {
    return NextResponse.json({ error: "flSeq(파일일련번호)가 필요합니다" }, { status: 400 })
  }

  // 숫자만 허용 (보안)
  if (!/^\d+$/.test(flSeq)) {
    return NextResponse.json({ error: "유효하지 않은 flSeq입니다" }, { status: 400 })
  }

  try {
    const fileUrl = `https://www.law.go.kr/LSW/flDownload.do?flSeq=${flSeq}`
    debugLogger.info("별표 파일 다운로드", { flSeq, fileUrl })

    const response = await fetch(fileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
      },
    })

    if (!response.ok) {
      debugLogger.error("별표 파일 다운로드 실패", { status: response.status })
      throw new Error(`파일 다운로드 실패: ${response.status}`)
    }

    const contentType = response.headers.get("content-type") || ""
    const buffer = await response.arrayBuffer()

    // 파일 타입 판별
    const isPdf = contentType.includes("pdf")
    const isHwp = contentType.includes("hwp")
    const isOctetStream = contentType.includes("octet-stream")

    // HTML 오류 페이지 감지
    if (contentType.includes("text/html")) {
      debugLogger.error("HTML 오류 페이지 응답", { contentType })
      throw new Error("파일을 찾을 수 없습니다")
    }

    // 응답 Content-Type 결정
    let responseContentType = "application/octet-stream"
    let disposition = "attachment"
    let filename = `annex-${flSeq}`

    if (isPdf) {
      responseContentType = "application/pdf"
      disposition = "inline"
      filename += ".pdf"
    } else if (isHwp) {
      responseContentType = "application/hwp+zip"
      disposition = "attachment"
      filename += ".hwp"
    } else if (isOctetStream) {
      // octet-stream인 경우 확장자 추측
      responseContentType = "application/octet-stream"
      disposition = "attachment"
    }

    debugLogger.success("별표 파일 다운로드 완료", {
      flSeq,
      size: buffer.byteLength,
      contentType,
      responseContentType,
    })

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": responseContentType,
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-File-Type": isPdf ? "pdf" : isHwp ? "hwp" : "unknown",
        // PDF 임베딩 허용
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    })
  } catch (error) {
    debugLogger.error("별표 파일 프록시 실패", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "파일 다운로드 실패" },
      { status: 500 }
    )
  }
}
