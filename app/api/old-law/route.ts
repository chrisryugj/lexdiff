import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

const LAW_SERVICE_BASE = "https://www.law.go.kr/DRF/lawService.do"
const LAW_SEARCH_BASE = "https://www.law.go.kr/DRF/lawSearch.do"
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
 */
function parseHistoryHtml(html: string, targetLawName: string): LawHistoryEntry[] {
  const histories: LawHistoryEntry[] = []

  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi
  const rows = html.match(rowPattern) || []

  for (const row of rows) {
    const linkMatch = row.match(/MST=(\d+)[^"]*efYd=(\d*)/)
    if (!linkMatch) continue

    const mst = linkMatch[1]
    const efYd = linkMatch[2] || ''

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

    const ancNoMatch = row.match(/제\s*(\d+)\s*호/)
    const ancNo = ancNoMatch?.[1] || ''

    const dateCells = row.match(/<td[^>]*>(\d{4}[.\-]?\d{2}[.\-]?\d{2})<\/td>/g) || []
    let ancYd = ''
    if (dateCells.length >= 1) {
      const dateMatch = dateCells[0].match(/(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})/)
      if (dateMatch) {
        ancYd = `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`
      }
    }

    const rrClsMatch = row.match(/(제정|일부개정|전부개정|폐지|타법개정|타법폐지|일괄개정|일괄폐지)/)
    const rrCls = rrClsMatch?.[1] || ''

    histories.push({ mst, efYd, ancNo, ancYd, lawNm, rrCls })
  }

  histories.sort((a, b) => parseInt(b.efYd || '0', 10) - parseInt(a.efYd || '0', 10))
  return histories
}

/**
 * 특정 시점에 유효한 연혁 찾기
 */
function findValidHistoryAtDate(
  histories: LawHistoryEntry[],
  targetEfYd: string
): LawHistoryEntry | null {
  if (!histories || histories.length === 0) return null

  const target = parseInt(targetEfYd, 10)

  // 이미 시행일자 내림차순 정렬됨
  for (const h of histories) {
    const efYd = parseInt(h.efYd, 10)
    if (efYd <= target) {
      return h
    }
  }

  // 모든 연혁이 target보다 미래면 가장 오래된 것 반환
  return histories[histories.length - 1]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawName = searchParams.get("lawName")
  const efYd = searchParams.get("efYd")  // 목표 시행일자
  const jo = searchParams.get("jo")      // 조문 코드 (선택)

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawName || !efYd) {
    return NextResponse.json({ error: "lawName과 efYd가 필요합니다" }, { status: 400 })
  }

  try {
    debugLogger.info("구법령 조회 시작", { lawName, efYd, jo })

    // 1. lsHistory API로 연혁 목록 조회
    const historyParams = new URLSearchParams({
      target: "lsHistory",
      OC,
      type: "HTML",
      query: lawName,
      display: "500",
      sort: "efdes",
    })

    const historyUrl = `${LAW_SEARCH_BASE}?${historyParams.toString()}`
    debugLogger.info("연혁 목록 조회", { url: historyUrl })

    const historyResponse = await fetch(historyUrl, {
      next: { revalidate: 86400 },
    })

    if (!historyResponse.ok) {
      throw new Error(`연혁 조회 실패: ${historyResponse.status}`)
    }

    const historyHtml = await historyResponse.text()
    const histories = parseHistoryHtml(historyHtml, lawName)

    if (histories.length === 0) {
      return NextResponse.json({
        error: "연혁 정보를 찾을 수 없습니다",
        lawName,
        efYd,
      }, { status: 404 })
    }

    debugLogger.info("연혁 목록 파싱 완료", {
      lawName,
      count: histories.length,
      sample: histories.slice(0, 3),
    })

    // 2. 목표 시점에 유효한 MST 찾기
    const validHistory = findValidHistoryAtDate(histories, efYd)

    if (!validHistory) {
      return NextResponse.json({
        error: "해당 시점의 법령을 찾을 수 없습니다",
        lawName,
        efYd,
        histories: histories.slice(0, 5),
      }, { status: 404 })
    }

    debugLogger.info("유효한 연혁 찾음", {
      targetEfYd: efYd,
      foundMst: validHistory.mst,
      foundEfYd: validHistory.efYd,
      ancNo: validHistory.ancNo,
    })

    // 3. law API로 해당 MST의 법령 전문 조회
    const lawParams = new URLSearchParams({
      target: "law",
      OC,
      type: "JSON",
      MST: validHistory.mst,
    })

    const lawUrl = `${LAW_SERVICE_BASE}?${lawParams.toString()}`
    debugLogger.info("구법령 전문 조회", { url: lawUrl })

    const lawResponse = await fetch(lawUrl, {
      next: { revalidate: 604800 }, // 7일 캐싱 (연혁법은 변경 없음)
    })

    if (!lawResponse.ok) {
      throw new Error(`법령 조회 실패: ${lawResponse.status}`)
    }

    const lawText = await lawResponse.text()

    // JSON 파싱
    let lawData: unknown
    try {
      lawData = JSON.parse(lawText)
    } catch {
      debugLogger.error("법령 JSON 파싱 실패", { text: lawText.substring(0, 500) })
      return NextResponse.json({
        error: "법령 데이터 파싱에 실패했습니다",
        lawName,
        mst: validHistory.mst,
      }, { status: 500 })
    }

    // 4. 조문 추출 (jo가 지정된 경우)
    let targetArticle = null
    if (jo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const articles = (lawData as any)?.법령?.조문?.조문단위
      if (articles) {
        const articleArray = Array.isArray(articles) ? articles : [articles]

        // 조문키로 매칭 (예: "0011001" = 제11조)
        targetArticle = articleArray.find((a: { 조문키?: string }) => {
          const articleKey = a.조문키 || ''
          // jo가 "001100" 형식인 경우
          return articleKey.startsWith(jo) || articleKey === jo + '1'
        })

        if (!targetArticle) {
          // 조문번호로 매칭 시도
          const joNum = jo.replace(/^0+/, '') // "001100" -> "11"
          targetArticle = articleArray.find((a: { 조문번호?: string }) => {
            const num = String(a.조문번호 || '').replace(/^0+/, '')
            return num === joNum || num === String(parseInt(joNum.substring(0, 2), 10))
          })
        }
      }

      debugLogger.info("조문 검색 결과", {
        jo,
        found: !!targetArticle,
        articleKey: targetArticle?.조문키,
      })
    }

    debugLogger.info("구법령 조회 완료", {
      lawName,
      mst: validHistory.mst,
      efYd: validHistory.efYd,
      ancNo: validHistory.ancNo,
      hasTargetArticle: !!targetArticle,
    })

    return NextResponse.json({
      lawName,
      requestedEfYd: efYd,
      historyInfo: {
        mst: validHistory.mst,
        efYd: validHistory.efYd,
        ancNo: validHistory.ancNo,
        ancYd: validHistory.ancYd,
        rrCls: validHistory.rrCls,
      },
      lawData,
      targetArticle,
      allHistories: histories.slice(0, 10), // 최근 10개 연혁만
    })
  } catch (error) {
    debugLogger.error("구법령 조회 실패", { lawName, efYd, error: String(error) })
    return NextResponse.json(
      { error: "구법령 조회에 실패했습니다", detail: String(error) },
      { status: 500 }
    )
  }
}
