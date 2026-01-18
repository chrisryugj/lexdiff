import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

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
 */
function parseHistoryHtml(html: string, targetLawName: string): LawHistoryEntry[] {
  const histories: LawHistoryEntry[] = []

  // 테이블 행에서 연혁 정보 추출
  // 패턴: <a href="...MST=123456...efYd=20181231">법령명</a>
  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi
  const rows = html.match(rowPattern) || []

  for (const row of rows) {
    // MST와 efYd 추출
    const linkMatch = row.match(/MST=(\d+)[^"]*efYd=(\d*)/)
    if (!linkMatch) continue

    const mst = linkMatch[1]
    const efYd = linkMatch[2] || ''

    // 법령명 추출 (링크 텍스트)
    const lawNmMatch = row.match(/<a[^>]+>([^<]+)<\/a>/)
    const lawNm = lawNmMatch?.[1]?.trim() || ''

    if (!lawNm) continue

    // 정확한 법령명 매칭 (시행령/시행규칙 제외)
    const normalizedTarget = targetLawName.replace(/\s/g, '')
    const normalizedLaw = lawNm.replace(/\s/g, '')

    // 시행령/시행규칙 필터링
    const targetHasDecree = targetLawName.includes('시행령') || targetLawName.includes('시행규칙')
    const lawHasDecree = lawNm.includes('시행령') || lawNm.includes('시행규칙')

    if (!targetHasDecree && lawHasDecree) {
      // 원본이 "지방세법"인데 결과가 "지방세법 시행령"이면 제외
      continue
    }

    // 정확히 일치하는지 확인
    const isExactMatch = normalizedLaw === normalizedTarget

    if (!isExactMatch) continue

    // 공포번호 추출 (제 XXXXX호)
    const ancNoMatch = row.match(/제\s*(\d+)\s*호/)
    const ancNo = ancNoMatch?.[1] || ''

    // 공포일자 추출 (YYYY.MM.DD 또는 YYYYMMDD 형식)
    // 테이블에서 공포일자 셀 찾기
    const dateCells = row.match(/<td[^>]*>(\d{4}[.\-]?\d{2}[.\-]?\d{2})<\/td>/g) || []
    let ancYd = ''
    if (dateCells.length >= 1 && dateCells[0]) {
      const dateMatch = dateCells[0].match(/(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})/)
      if (dateMatch) {
        ancYd = `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`
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
  const lawName = searchParams.get("lawName")
  const display = searchParams.get("display") || "100"

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawName) {
    return NextResponse.json({ error: "lawName이 필요합니다" }, { status: 400 })
  }

  try {
    // lsHistory API 호출 (HTML만 지원)
    const params = new URLSearchParams({
      target: "lsHistory",
      OC,
      type: "HTML",
      query: lawName,
      display,
      sort: "efdes", // 시행일자 내림차순
    })

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("법령 연혁 API 호출", { lawName, url })

    const response = await fetch(url, {
      next: { revalidate: 86400 }, // 24시간 캐싱
    })

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`)
    }

    const html = await response.text()

    // HTML 파싱하여 연혁 목록 추출
    const histories = parseHistoryHtml(html, lawName)

    debugLogger.info("법령 연혁 조회 완료", {
      lawName,
      count: histories.length,
      sample: histories.slice(0, 3),
    })

    return NextResponse.json({
      lawName,
      histories,
      total: histories.length,
    })
  } catch (error) {
    debugLogger.error("법령 연혁 조회 실패", { lawName, error: String(error) })
    return NextResponse.json(
      { error: "법령 연혁 조회에 실패했습니다", detail: String(error) },
      { status: 500 }
    )
  }
}
