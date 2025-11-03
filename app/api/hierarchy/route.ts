import { NextRequest } from "next/server"

const LAW_API_KEY = process.env.LAW_OC

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lawName = searchParams.get("lawName")
  const lawId = searchParams.get("lawId")
  const mst = searchParams.get("mst")

  if (!LAW_API_KEY) {
    return new Response("LAW_OC API key not configured", { status: 500 })
  }

  try {
    let url: string

    // 법령 ID나 MST가 있으면 본문 조회, 없으면 목록에서 검색
    if (lawId || mst) {
      const params = new URLSearchParams({
        OC: LAW_API_KEY,
        target: "lsStmd",
        type: "XML",
      })

      if (lawId) {
        params.append("ID", lawId)
      } else if (mst) {
        params.append("MST", mst)
      }

      url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`
    } else if (lawName) {
      // 법령명으로 검색
      const params = new URLSearchParams({
        OC: LAW_API_KEY,
        target: "lsStmd",
        type: "XML",
        query: lawName,
      })

      url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    } else {
      return new Response("Missing required parameter: lawName, lawId, or mst", {
        status: 400,
      })
    }

    console.log("[hierarchy API] Fetching:", url)

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LexDiff/1.0)",
      },
    })

    if (!response.ok) {
      console.error("[hierarchy API] Failed:", response.status, response.statusText)
      return new Response(`Failed to fetch hierarchy: ${response.statusText}`, {
        status: response.status,
      })
    }

    const xmlText = await response.text()
    console.log("[hierarchy API] Success, length:", xmlText.length)

    return new Response(xmlText, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    })
  } catch (error) {
    console.error("[hierarchy API] Error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
