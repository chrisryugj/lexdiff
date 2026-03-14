/**
 * 법령 통계 API
 * 법제처 통계 페이지(lawStatistics.do)에서 현행법령 건수 파싱
 * + DRF API로 행정규칙/판례 건수 조회
 * 결과는 Cache-Control로 24시간 캐시
 */

import { NextResponse } from "next/server"

interface LawStats {
  constitution: number  // 헌법
  laws: number          // 법령 소계 (법률+대통령령+총리령+부령+기타)
  adminRules: number    // 행정규칙 (위임법령 = 시행령+시행규칙+행정규칙)
  ordinances: number    // 자치법규 소계 (조례+규칙+기타)
  precedents: number    // 판례
  asOf?: string         // 기준일
}

/**
 * 법제처 통계 페이지 HTML 파싱
 * HTML 구조: div.exis_cont > dl.ex1(헌법) / dl.ex2(법령) / dl.ex3(자치법규)
 * 각 소계는 <p><em>소계</em><span><b>숫자</b>건</span></p>
 */
async function fetchFromStatisticsPage(): Promise<Partial<LawStats> | null> {
  try {
    const res = await fetch(
      "https://www.law.go.kr/lawStatistics.do?menuId=13&subMenuId=557",
      {
        next: { revalidate: 86400 },
        headers: { "User-Agent": "Mozilla/5.0 LexDiff/1.0" },
      }
    )
    if (!res.ok) return null

    const html = await res.text()
    const parseNum = (s: string) => parseInt(s.replace(/,/g, ""), 10) || 0

    // 기준일
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})\s*기준/)
    const asOf = dateMatch ? dateMatch[1] : undefined

    // 첫 번째 exis_cont 블록 (현행법령) 추출
    const contMatch = html.match(/<div class="exis_cont">([\s\S]*?)<\/div>\s*<\/li>/)
    if (!contMatch) return null
    const block = contMatch[1]

    // 헌법: dl.ex1 내 <b>숫자</b>
    const ex1 = block.match(/<dl class="ex1">([\s\S]*?)<\/dl>/)
    const constitutionMatch = ex1?.[1].match(/<b>([\d,]+)<\/b>/)
    const constitution = constitutionMatch ? parseNum(constitutionMatch[1]) : 0

    // 법령 소계: dl.ex2 내 소계 <b>숫자</b>
    const ex2 = block.match(/<dl class="ex2">([\s\S]*?)<\/dl>/)
    const lawSubMatch = ex2?.[1].match(/소계[\s\S]*?<b>([\d,]+)<\/b>/)
    const laws = lawSubMatch ? parseNum(lawSubMatch[1]) : 0

    // 자치법규 소계: dl.ex3 내 소계 <b>숫자</b>
    const ex3 = block.match(/<dl class="ex3">([\s\S]*?)<\/dl>/)
    const ordinSubMatch = ex3?.[1].match(/소계[\s\S]*?<b>([\d,]+)<\/b>/)
    const ordinances = ordinSubMatch ? parseNum(ordinSubMatch[1]) : 0

    return { constitution, laws, ordinances, asOf }
  } catch {
    return null
  }
}

/**
 * DRF 검색 API로 건수 조회 (행정규칙, 판례용)
 */
async function fetchTotalCount(
  target: string,
  query: string,
  apiKey: string
): Promise<number> {
  try {
    const params = new URLSearchParams({
      OC: apiKey,
      target,
      type: "XML",
      query,
      display: "1",
    })

    const response = await fetch(
      `https://www.law.go.kr/DRF/lawSearch.do?${params}`,
      { next: { revalidate: 86400 } }
    )
    if (!response.ok) return 0

    const xml = await response.text()
    if (xml.includes("<!DOCTYPE html")) return 0

    const match = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
    return match ? parseInt(match[1], 10) : 0
  } catch {
    return 0
  }
}

export async function GET() {
  const apiKey = process.env.LAW_OC

  const [statsPage, adminRules, precedents] = await Promise.all([
    fetchFromStatisticsPage(),
    apiKey ? fetchTotalCount("admrul", "규", apiKey) : Promise.resolve(0),
    apiKey ? fetchTotalCount("prec", "판결", apiKey) : Promise.resolve(0),
  ])

  const result: LawStats = {
    constitution: statsPage?.constitution || 0,
    laws: statsPage?.laws || 0,
    adminRules,
    ordinances: statsPage?.ordinances || 0,
    precedents,
    asOf: statsPage?.asOf,
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  })
}
