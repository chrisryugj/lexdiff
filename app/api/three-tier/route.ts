import { NextResponse } from "next/server"
import { parseThreeTierDelegation } from "@/lib/three-tier-parser"
import { debugLogger } from "@/lib/debug-logger"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

/**
 * 3단비교 데이터 가져오기 (위임조문만)
 * 인용조문은 현재 비활성화됨
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawId = searchParams.get("lawId")
  const mst = searchParams.get("mst")

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawId && !mst) {
    return NextResponse.json({ error: "lawId 또는 mst가 필요합니다" }, { status: 400 })
  }

  try {
    debugLogger.info("3단비교 데이터 요청 시작 (위임조문)", { lawId, mst })

    // 위임조문 (knd=2)만 요청
    const delegationParams = new URLSearchParams({
      target: "thdCmp",
      OC,
      type: "JSON",
      knd: "2",
    })

    if (lawId) {
      delegationParams.append("ID", lawId)
    } else if (mst) {
      delegationParams.append("MST", mst)
    }

    const delegationUrl = `${LAW_API_BASE}?${delegationParams.toString()}`

    debugLogger.info("위임조문 API 요청")

    const delegationResponse = await fetch(delegationUrl, {
      next: { revalidate: 3600 },
      cache: "force-cache"
    })

    if (!delegationResponse.ok) {
      throw new Error("API 응답 오류")
    }

    const delegationText = await delegationResponse.text()

    debugLogger.info("API 응답 수신 완료", {
      delegationLength: delegationText.length,
    })

    // JSON 파싱
    const delegationJson = JSON.parse(delegationText)

    // 파서 실행
    const delegationData = parseThreeTierDelegation(delegationJson)

    debugLogger.success("3단비교 데이터 파싱 완료", {
      delegationArticles: delegationData.articles.length,
    })

    return NextResponse.json(
      {
        success: true,
        delegation: delegationData,
        citation: null, // 인용조문 비활성화
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    )
  } catch (error) {
    debugLogger.error("3단비교 데이터 조회 실패", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 },
    )
  }
}
