import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do"
const OC = process.env.LAW_OC || ""

export interface LawHistoryEntry {
  mst: string
  efYd: string
  ancNo: string
  ancYd: string
  lawNm: string
  rrCls: string
}

/**
 * lsHistory HTML 응답에서 연혁 정보 추출
 * 법제처 API가 HTML만 반환하므로 정규식으로 파싱
 *
 * @param targetLawName null이면 법령명 필터링을 건너뜀 (ID 경로 — 이미 단일 법령만 반환됨)
 */
function parseHistoryHtml(html: string, targetLawName: string | null): LawHistoryEntry[] {
  const histories: LawHistoryEntry[] = []

  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi
  const rows = html.match(rowPattern) || []

  for (const row of rows) {
    // MST와 efYd 추출 (&amp; 이스케이프 대응)
    const mstMatch = row.match(/MST=(\d+)/)
    const efYdMatch = row.match(/efYd=(\d+)/)
    if (!mstMatch) continue

    const mst = mstMatch[1]
    const efYd = efYdMatch?.[1] || ''

    // 법령명 추출 (링크 텍스트)
    const lawNmMatch = row.match(/<a[^>]+>([^<]+)<\/a>/)
    const lawNm = lawNmMatch?.[1]?.trim() || ''

    if (!lawNm) continue

    // query 경로에서만 법령명 필터링 (ID 경로는 이미 단일 법령만 반환됨)
    if (targetLawName) {
      const normalizedTarget = targetLawName.replace(/\s/g, '')
      const normalizedLaw = lawNm.replace(/\s/g, '')
      if (normalizedLaw !== normalizedTarget) continue
    }

    // 공포번호 추출 (제 XXXXX호)
    const ancNoMatch = row.match(/제\s*(\d+)\s*호/)
    const ancNo = ancNoMatch?.[1] || ''

    // 공포일자 추출 (과거 row는 한자리 월/일 허용: 2008.1.28)
    const dateCells = row.match(/<td[^>]*>\s*\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\s*<\/td>/g) || []
    let ancYd = ''
    if (dateCells[0]) {
      const dateMatch = dateCells[0].match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/)
      if (dateMatch) {
        ancYd = `${dateMatch[1]}${dateMatch[2].padStart(2, '0')}${dateMatch[3].padStart(2, '0')}`
      }
    }

    // 제개정구분 추출
    const rrClsMatch = row.match(/(제정|일부개정|전부개정|폐지|타법개정|타법폐지|일괄개정|일괄폐지)/)
    const rrCls = rrClsMatch?.[1] || ''

    histories.push({
      mst,
      efYd,
      ancNo,
      ancYd,
      lawNm,
      rrCls,
    })
  }

  // 시행일자 내림차순 정렬
  histories.sort((a, b) => {
    const aDate = parseInt(a.efYd || '0', 10)
    const bDate = parseInt(b.efYd || '0', 10)
    return bDate - aDate
  })

  return histories
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawId = searchParams.get("lawId")
  const lawName = searchParams.get("lawName")
  const display = searchParams.get("display") || "100"

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawId && !lawName) {
    return NextResponse.json({ error: "lawId 또는 lawName이 필요합니다" }, { status: 400 })
  }

  try {
    // lsHistory API 호출 (HTML만 지원)
    // lawId 경로: ID=법령ID → 단일 법령의 전체 개정 연혁 반환 (정답)
    // lawName 경로: query=법령명 → 이름 비슷한 여러 법령 리스트 (폴백, 정확도 낮음)
    const params = new URLSearchParams({
      target: "lsHistory",
      OC,
      type: "HTML",
      display,
      sort: "efdes",
    })

    if (lawId) {
      params.append("ID", lawId)
    } else if (lawName) {
      params.append("query", lawName)
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("법령 연혁 API 호출", { lawId, lawName, url })

    const response = await fetchWithTimeout(url, {
      next: { revalidate: 86400 },
    })

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`)
    }

    const html = await response.text()

    // lawId 경로는 이미 단일 법령만 반환되므로 이름 필터 스킵
    const histories = parseHistoryHtml(html, lawId ? null : lawName)

    debugLogger.info("법령 연혁 조회 완료", {
      lawId,
      lawName,
      count: histories.length,
      sample: histories.slice(0, 3),
    })

    return NextResponse.json({
      lawId,
      lawName,
      histories,
      total: histories.length,
    })
  } catch (error) {
    debugLogger.error("법령 연혁 조회 실패", { lawId, lawName, error: String(error) })
    return safeErrorResponse(error, "법령 연혁 조회에 실패했습니다")
  }
}
