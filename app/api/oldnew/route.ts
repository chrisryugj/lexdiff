import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawId = searchParams.get("lawId")
  const mst = searchParams.get("mst")
  const lm = searchParams.get("lm") // 법령명
  const ld = searchParams.get("ld") // 공포일자
  const ln = searchParams.get("ln") // 공포번호

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawId && !mst && !lm) {
    return NextResponse.json({ error: "lawId, mst 또는 lm이 필요합니다" }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      target: "oldAndNew",
      OC,
      type: "XML",
    })

    if (lawId) {
      params.append("ID", lawId)
      // 개정일자와 번호가 있으면 특정 개정 버전 조회
      if (ld) params.append("LD", ld)
      if (ln) params.append("LN", ln)
    } else if (mst) {
      params.append("MST", mst)
      if (ld) params.append("LD", ld)
      if (ln) params.append("LN", ln)
    } else if (lm) {
      params.append("LM", lm)
      if (ld) params.append("LD", ld)
      if (ln) params.append("LN", ln)
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("신·구법 대조 API 호출", { lawId, mst, lm, ld, ln })

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    const text = await response.text()
    debugLogger.success("신·구법 대조 조회 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    return safeErrorResponse(error, "신구조문 조회 실패")
  }
}
