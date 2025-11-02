import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

function normalizeDateFormat(dateStr: string | null): string {
  if (!dateStr) {
    const today = new Date()
    return today.toISOString().slice(0, 10).replace(/-/g, "")
  }

  const cleaned = dateStr.replace(/[^\d]/g, "")

  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    console.log(`[v0] Normalized efYd parameter: "${dateStr}" → "${cleaned}"`)
    return cleaned
  }

  console.log(`[v0] Invalid efYd format "${dateStr}", using today's date`)
  const today = new Date()
  return today.toISOString().slice(0, 10).replace(/-/g, "")
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawId = searchParams.get("lawId")
  const mst = searchParams.get("mst")
  const efYd = searchParams.get("efYd")
  const jo = searchParams.get("jo")

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawId && !mst) {
    return NextResponse.json({ error: "lawId 또는 mst가 필요합니다" }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      target: "eflaw",
      OC,
      type: "JSON",
    })

    console.log("[v0] ========== EFLAW API REQUEST ==========")
    console.log("[v0] Raw efYd parameter:", efYd)
    console.log("[v0] Law ID:", lawId)
    console.log("[v0] MST:", mst)
    console.log("[v0] JO parameter:", jo)

    if (lawId) {
      params.append("ID", lawId)
      if (efYd) {
        const effectiveDate = normalizeDateFormat(efYd)
        console.log("[v0] Using provided effective date:", effectiveDate)
        params.append("efYd", effectiveDate)
      } else {
        console.log("[v0] No efYd provided - API will return the most current version")
      }
    } else if (mst) {
      params.append("MST", mst)
      if (efYd) {
        const effectiveDate = normalizeDateFormat(efYd)
        console.log("[v0] Using provided effective date:", effectiveDate)
        params.append("efYd", effectiveDate)
      } else {
        console.log("[v0] No efYd provided - API will return the most current version")
      }
    }

    if (jo) {
      params.append("JO", jo)
      console.log("[v0] ✓ Adding JO parameter to API call:", jo)
      debugLogger.info("특정 조문 요청", { jo })
    } else {
      console.log("[v0] ✓ No JO parameter - fetching all articles")
      debugLogger.info("전체 조문 요청")
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("현행법령 API 호출", { lawId, mst, efYd: efYd || "최신버전", jo: jo || "전체조문", url })
    console.log("[v0] Full API URL:", url)

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })

    const text = await response.text()
    console.log("[v0] Eflaw response status:", response.status)
    console.log("[v0] Eflaw response (first 500 chars):", text.substring(0, 500))

    if (!response.ok) {
      debugLogger.error("현행법령 API 오류", { status: response.status, body: text.substring(0, 500) })
      throw new Error(`fetch to ${url} failed with status ${response.status} and body: ${text}`)
    }

    if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
      console.log("[v0] Received HTML error page instead of JSON")
      debugLogger.error("현행법령 API가 HTML 오류 페이지를 반환했습니다", { url })
      throw new Error("API가 오류 페이지를 반환했습니다. 법령명이나 조문 번호를 확인해주세요.")
    }

    debugLogger.success("현행법령 조회 완료", { length: text.length })
    console.log("[v0] ========== EFLAW API SUCCESS ==========")

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.log("[v0] Eflaw API error:", error)
    debugLogger.error("현행법령 조회 실패", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 })
  }
}
