import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

function normalizeDateFormat(dateStr: string | null): string {
  if (!dateStr) {
    const today = new Date()
    return today.toISOString().slice(0, 10).replace(/-/g, "")
  }

  const cleaned = dateStr.replace(/[^\d]/g, "")

  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    return cleaned
  }

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

    if (lawId) {
      params.append("ID", lawId)
      if (efYd) {
        const effectiveDate = normalizeDateFormat(efYd)
        params.append("efYd", effectiveDate)
      }
    } else if (mst) {
      params.append("MST", mst)
      if (efYd) {
        const effectiveDate = normalizeDateFormat(efYd)
        params.append("efYd", effectiveDate)
      }
    }

    if (jo) {
      params.append("JO", jo)
      debugLogger.info("특정 조문 요청", { jo })
    } else {
      debugLogger.info("전체 조문 요청")
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("현행법령 API 호출", { lawId, mst, efYd: efYd || "최신버전", jo: jo || "전체조문", url })

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })

    const text = await response.text()

    if (!response.ok) {
      debugLogger.error("현행법령 API 오류", { status: response.status, body: text.substring(0, 500) })
      throw new Error(`현행법령 API 응답 오류 (status ${response.status})`)
    }

    if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
      debugLogger.error("현행법령 API가 HTML 오류 페이지를 반환했습니다", { url })
      throw new Error("API가 오류 페이지를 반환했습니다. 법령명이나 조문 번호를 확인해주세요.")
    }

    debugLogger.success("현행법령 조회 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    return safeErrorResponse(error, "법령 조회 실패")
  }
}
