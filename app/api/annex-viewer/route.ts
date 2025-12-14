import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

/**
 * 별표 뷰어 URL 조회 API
 * 법제처의 lsBylContentsInfoR.do를 호출하여 iframe 뷰어 URL 추출
 *
 * GET /api/annex-viewer?bylSeq={별표일련번호}&bylNo={별표번호}&lsiSeq={법령일련번호}
 *
 * 반환: {
 *   success: boolean,
 *   viewerUrl?: string,    // iframe src URL
 *   imageUrls?: string[],  // 이미지 URL 배열 (폴백용)
 *   pdfFlSeq?: string,     // PDF 파일 일련번호
 *   hanFlSeq?: string,     // HWP 파일 일련번호
 *   error?: string
 * }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const bylSeq = searchParams.get("bylSeq")
  const bylNo = searchParams.get("bylNo") || "000100"
  const lsiSeq = searchParams.get("lsiSeq") || "0"

  if (!bylSeq) {
    return NextResponse.json({ error: "bylSeq(별표일련번호)가 필요합니다" }, { status: 400 })
  }

  // 숫자만 허용 (보안)
  if (!/^\d+$/.test(bylSeq)) {
    return NextResponse.json({ error: "유효하지 않은 bylSeq입니다" }, { status: 400 })
  }

  try {
    debugLogger.info("[annex-viewer] 뷰어 URL 조회 시작", { bylSeq, bylNo, lsiSeq })

    // 법제처 별표 본문 API 호출
    const formData = new URLSearchParams({
      bylSeq,
      bylNo,
      lsiSeq,
    })

    const response = await fetch("https://www.law.go.kr/LSW/lsBylContentsInfoR.do", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      throw new Error(`법제처 API 호출 실패: ${response.status}`)
    }

    const html = await response.text()

    // iframe src 추출
    const iframeSrcMatch = html.match(/src="([^"]+viewer\/skin\/doc\.html[^"]+)"/)
    const viewerUrl = iframeSrcMatch
      ? `https://www.law.go.kr${iframeSrcMatch[1].replace(/&amp;/g, "&")}`
      : null

    // 이미지 URL 추출 (폴백용)
    const imageMatches = html.matchAll(/src="(\/LSW\/flDownload\.do\?flSeq=\d+)"/g)
    const imageUrls = Array.from(imageMatches).map(
      (m) => `https://www.law.go.kr${m[1]}`
    )

    // PDF/HWP 파일 일련번호 추출
    const pdfFlSeqMatch = html.match(/id="pdfFlSeq"[^>]*value="(\d+)"/)
    const hanFlSeqMatch = html.match(/id="hanFlSeq"[^>]*value="(\d+)"/)

    const pdfFlSeq = pdfFlSeqMatch?.[1]
    const hanFlSeq = hanFlSeqMatch?.[1]

    debugLogger.success("[annex-viewer] 뷰어 URL 조회 완료", {
      bylSeq,
      hasViewerUrl: !!viewerUrl,
      imageCount: imageUrls.length,
      pdfFlSeq,
      hanFlSeq,
    })

    return NextResponse.json({
      success: true,
      viewerUrl,
      imageUrls,
      pdfFlSeq,
      hanFlSeq,
    })
  } catch (error) {
    debugLogger.error("[annex-viewer] 뷰어 URL 조회 실패", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "뷰어 URL 조회 실패",
      },
      { status: 500 }
    )
  }
}
