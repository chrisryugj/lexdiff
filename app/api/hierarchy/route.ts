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
    let finalMst = mst
    let finalLawId = lawId

    // lawName만 주어진 경우, 먼저 검색으로 MST 찾기
    if (lawName && !finalMst && !finalLawId) {
      const searchParams = new URLSearchParams({
        OC: LAW_API_KEY,
        target: "law",
        type: "XML",
        query: lawName,
        display: "1",
      })

      const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?${searchParams.toString()}`
      console.log("[hierarchy API] Searching for law:", searchUrl)

      const searchResponse = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LexDiff/1.0)",
        },
      })

      if (searchResponse.ok) {
        const searchXml = await searchResponse.text()

        // XML에서 MST 추출 (정규식 사용)
        const mstMatch = searchXml.match(/<법령일련번호>(\d+)<\/법령일련번호>/)

        if (mstMatch && mstMatch[1]) {
          finalMst = mstMatch[1].trim()
          console.log("[hierarchy API] Found MST:", finalMst)
        } else {
          console.error("[hierarchy API] MST not found in search results")
          return new Response("Law not found", { status: 404 })
        }
      } else {
        console.error("[hierarchy API] Search failed:", searchResponse.status)
        return new Response("Failed to search for law", { status: searchResponse.status })
      }
    }

    // MST나 lawId로 체계도 본문 조회
    if (!finalMst && !finalLawId) {
      return new Response("Missing required parameter: lawName, lawId, or mst", {
        status: 400,
      })
    }

    const params = new URLSearchParams({
      OC: LAW_API_KEY,
      target: "lsStmd",
      type: "XML",
    })

    if (finalLawId) {
      params.append("ID", finalLawId)
    } else if (finalMst) {
      params.append("MST", finalMst)
    }

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`
    console.log("[hierarchy API] Fetching hierarchy:", url)

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
