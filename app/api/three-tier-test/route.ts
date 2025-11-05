import { NextResponse } from "next/server"
import { parseThreeTierDelegation, parseThreeTierCitation } from "@/lib/three-tier-parser"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawId = searchParams.get("lawId")
  const mst = searchParams.get("mst")
  const knd = searchParams.get("knd") || "2" // 1: 인용조문, 2: 위임조문

  if (!OC) {
    return NextResponse.json({ error: "LAW_OC 환경변수가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawId && !mst) {
    return NextResponse.json({ error: "lawId 또는 mst가 필요합니다" }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      target: "thdCmp",
      OC,
      type: "JSON",
      knd,
    })

    if (lawId) {
      params.append("ID", lawId)
    } else if (mst) {
      params.append("MST", mst)
    }

    const url = `${LAW_API_BASE}?${params.toString()}`

    console.log("[3단비교 테스트] API URL:", url)
    console.log("[3단비교 테스트] 요청 파라미터:", {
      lawId,
      mst,
      knd: knd === "1" ? "인용조문" : "위임조문",
    })

    const response = await fetch(url)
    const text = await response.text()

    console.log("[3단비교 테스트] 응답 상태:", response.status)
    console.log("[3단비교 테스트] 응답 길이:", text.length, "바이트")
    console.log("[3단비교 테스트] 응답 샘플 (처음 500자):")
    console.log(text.substring(0, 500))

    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    try {
      const jsonData = JSON.parse(text)

      // JSON 구조 분석
      console.log("[3단비교 테스트] JSON 최상위 키:", Object.keys(jsonData))

      // 파서 사용
      let parsedData
      if (knd === "1") {
        console.log("[3단비교 테스트] 인용조문 파서 실행 중...")
        parsedData = parseThreeTierCitation(jsonData)
      } else {
        console.log("[3단비교 테스트] 위임조문 파서 실행 중...")
        parsedData = parseThreeTierDelegation(jsonData)
      }

      console.log("[3단비교 테스트] 파싱 완료:")
      console.log("  - 법령명:", parsedData.meta.lawName)
      console.log("  - 전체 조문 수:", parsedData.articles.length)
      console.log("  - 위임조문이 있는 조문 수:", parsedData.articles.filter((a) => a.delegations.length > 0).length)

      // 샘플 조문 출력
      if (parsedData.articles.length > 0) {
        const sampleArticle = parsedData.articles.find((a) => a.delegations.length > 0)
        if (sampleArticle) {
          console.log("[3단비교 테스트] 샘플 조문 (위임조문 보유):")
          console.log("  - JO:", sampleArticle.jo)
          console.log("  - 조문:", sampleArticle.joNum)
          console.log("  - 제목:", sampleArticle.title)
          console.log("  - 내용:", sampleArticle.content.substring(0, 100) + "...")
          console.log("  - 위임조문 개수:", sampleArticle.delegations.length)
          sampleArticle.delegations.forEach((del, idx) => {
            console.log(`    [${idx + 1}] ${del.type}: ${del.joNum || "조번호없음"} - ${del.title || "제목없음"}`)
          })
        }
      }

      return NextResponse.json({
        success: true,
        url,
        kndType: knd === "1" ? "인용조문" : "위임조문",
        rawData: jsonData,
        parsedData,
      })
    } catch (parseError) {
      console.error("[3단비교 테스트] JSON 파싱 실패:", parseError)
      return NextResponse.json({
        success: false,
        url,
        error: parseError instanceof Error ? parseError.message : "파싱 실패",
        rawText: text.substring(0, 500),
      })
    }
  } catch (error) {
    console.error("[3단비교 테스트] API 호출 실패:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 },
    )
  }
}
