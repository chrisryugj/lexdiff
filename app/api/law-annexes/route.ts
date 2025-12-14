import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import type { LawAnnex, AnnexKind } from "@/lib/law-types"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do"
const OC = process.env.LAW_OC || ""

interface LawApiAnnexRow {
  별표일련번호?: string
  별표번호?: string
  별표명?: string
  별표종류?: string
  관련법령명?: string
  관련법령ID?: string
  별표서식파일링크?: string
  별표서식PDF파일링크?: string
  별표법령상세링크?: string
  공포일자?: string
}

// 자치법규(조례) 별표 응답
interface OrdinanceAnnexRow {
  별표일련번호?: string
  별표번호?: string
  별표명?: string
  별표종류?: string
  관련자치법규명?: string
  관련자치법규일련번호?: string
  별표서식파일링크?: string
  별표자치법규상세링크?: string
  지자체기관명?: string
  공포일자?: string
}

// 행정규칙 별표 응답 (admbyl)
interface AdminRuleAnnexRow {
  별표일련번호?: string
  별표번호?: string
  별표명?: string
  별표종류?: string
  관련행정규칙명?: string
  관련행정규칙일련번호?: string
  별표서식파일링크?: string
  별표행정규칙상세링크?: string
  소관부처?: string
  발령일자?: string
}

// 통합 API 응답 (licBylSearch 구조로 통일)
// 일반 법령: licbyl[], 조례: ordinbyl[], 행정규칙: admbyl[]
interface LicBylSearchResponse {
  licBylSearch?: {
    resultMsg?: string
    키워드?: string
    page?: string
    target?: string
    totalCnt?: string
    section?: string
    licbyl?: LawApiAnnexRow[]      // 일반 법령 별표
    ordinbyl?: OrdinanceAnnexRow[] // 조례 별표
    admbyl?: AdminRuleAnnexRow[]   // 행정규칙 별표
  }
}

/**
 * 별표 종류 텍스트를 AnnexKind로 변환
 * API 응답의 별표종류 필드가 텍스트("별표", "서식" 등)로 오는 경우 처리
 */
function mapAnnexKind(kind?: string): AnnexKind {
  if (!kind) return "1"
  const kindMap: Record<string, AnnexKind> = {
    "별표": "1",
    "서식": "2",
    "별지": "3",
    "별도": "4",
    "부록": "5",
  }
  return kindMap[kind] || (kind as AnnexKind) || "1"
}

/**
 * 법령 종류 판별
 * 반환값: 'law' | 'ordinance' | 'admin'
 */
function detectLawType(lawName: string): 'law' | 'ordinance' | 'admin' {
  // 조례/규칙 판별 (자치법규)
  if (/조례/.test(lawName) ||
    /(특별시|광역시|도|시|군|구)\s+[가-힣]+\s*(조례|규칙)/.test(lawName)) {
    return 'ordinance'
  }

  // 행정규칙 판별 (훈령, 예규, 고시, 지침 등)
  if (/훈령|예규|고시|지침|규정|내규/.test(lawName)) {
    return 'admin'
  }

  // 일반 법령
  return 'law'
}

/**
 * 별표 목록 조회 API
 * 법령명으로 해당 법령의 별표 목록을 조회
 * - 일반 법령: target=licbyl
 * - 조례/규칙: target=ordinbyl
 * - 행정규칙: target=admbyl
 *
 * GET /api/law-annexes?query={법령명}&knd={별표종류}
 * - query: 법령명 (필수)
 * - knd: 별표종류 (선택, 기본값: 1)
 *   - 법령: 1=별표, 2=서식, 3=별지, 4=별도, 5=부록
 *   - 조례/행정규칙: 1=별표, 2=서식, 3=별도, 4=별지
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")
  const knd = searchParams.get("knd") || "1" // 기본값: 별표만

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!query) {
    return NextResponse.json({ error: "query(법령명)가 필요합니다" }, { status: 400 })
  }

  try {
    // 법령 종류에 따라 API target 결정
    const lawType = detectLawType(query)
    const targetMap = {
      law: "licbyl",
      ordinance: "ordinbyl",
      admin: "admbyl",
    }
    const target = targetMap[lawType]

    // 조례/행정규칙은 knd 필터 없이 전체 조회 (별표/서식 구분이 다름)
    const params = new URLSearchParams({
      target,
      OC,
      type: "JSON",
      query,
      search: "2", // 해당법령으로 검색
      display: "100", // 최대 100개
    })

    // 일반 법령만 knd 필터 적용
    if (lawType === 'law' && knd) {
      params.set("knd", knd)
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("별표 목록 API 호출", { query, knd, target, lawType, url })

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // 1시간 캐시
    })

    const text = await response.text()

    if (!response.ok) {
      debugLogger.error("별표 목록 API 오류", { status: response.status, body: text.substring(0, 500) })
      throw new Error(`API 호출 실패: ${response.status}`)
    }

    // HTML 오류 페이지 확인
    if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
      debugLogger.error("별표 목록 API가 HTML 오류 페이지를 반환했습니다", { url })
      throw new Error("API가 오류 페이지를 반환했습니다")
    }

    // JSON 파싱 (모든 타입이 licBylSearch 구조 사용)
    let rawData: LicBylSearchResponse
    try {
      rawData = JSON.parse(text)
    } catch {
      debugLogger.error("별표 목록 JSON 파싱 실패", { text: text.substring(0, 500) })
      throw new Error("JSON 파싱 실패")
    }

    const searchResult = rawData.licBylSearch
    if (!searchResult) {
      debugLogger.warn("별표 목록 응답에 licBylSearch가 없습니다", { text: text.substring(0, 500) })
      return NextResponse.json({
        success: true,
        totalCount: 0,
        lawType,
        annexes: [],
      })
    }

    // HTML 태그 제거 함수
    const stripHtml = (str: string) => str?.replace(/<[^>]*>/g, '') || ''

    let annexes: LawAnnex[]

    if (lawType === 'ordinance') {
      // 조례/규칙 응답 처리 (licBylSearch.ordinbyl 배열)
      const rows: OrdinanceAnnexRow[] = searchResult.ordinbyl || []

      annexes = rows.map((row) => ({
        annexId: row.별표일련번호 || "",
        annexNumber: row.별표번호 || "",
        annexName: row.별표명 || "",
        annexKind: mapAnnexKind(row.별표종류),
        lawName: stripHtml(row.관련자치법규명 || ""),
        lawId: row.관련자치법규일련번호 || "",
        fileLink: row.별표서식파일링크,
        pdfLink: row.별표서식파일링크, // 조례는 PDF 링크가 동일
        detailLink: row.별표자치법규상세링크,
        promulgationDate: row.공포일자,
        localGovernment: row.지자체기관명,
      }))

      debugLogger.success("조례 별표 목록 조회 완료", {
        query,
        count: annexes.length,
        total: searchResult.totalCnt,
      })
    } else if (lawType === 'admin') {
      // 행정규칙 응답 처리 (licBylSearch.admbyl 배열)
      const rows: AdminRuleAnnexRow[] = searchResult.admbyl || []

      annexes = rows.map((row) => ({
        annexId: row.별표일련번호 || "",
        annexNumber: row.별표번호 || "",
        annexName: row.별표명 || "",
        annexKind: mapAnnexKind(row.별표종류),
        lawName: row.관련행정규칙명 || "",
        lawId: row.관련행정규칙일련번호 || "",
        fileLink: row.별표서식파일링크,
        pdfLink: row.별표서식파일링크,
        detailLink: row.별표행정규칙상세링크,
        promulgationDate: row.발령일자,
      }))

      debugLogger.success("행정규칙 별표 목록 조회 완료", {
        query,
        count: annexes.length,
        total: searchResult.totalCnt,
      })
    } else {
      // 일반 법령 응답 처리 (licBylSearch.licbyl 배열)
      const rows: LawApiAnnexRow[] = searchResult.licbyl || []

      annexes = rows.map((row) => ({
        annexId: row.별표일련번호 || "",
        annexNumber: row.별표번호 || "",
        annexName: row.별표명 || "",
        annexKind: mapAnnexKind(row.별표종류),
        lawName: row.관련법령명 || "",
        lawId: row.관련법령ID || "",
        fileLink: row.별표서식파일링크,
        pdfLink: row.별표서식PDF파일링크,
        detailLink: row.별표법령상세링크,
        promulgationDate: row.공포일자,
      }))

      debugLogger.success("별표 목록 조회 완료", {
        query,
        count: annexes.length,
        total: searchResult.totalCnt,
      })
    }

    return NextResponse.json({
      success: true,
      totalCount: parseInt(searchResult.totalCnt || "0", 10),
      lawType,
      annexes,
    })
  } catch (error) {
    debugLogger.error("별표 목록 조회 실패", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 }
    )
  }
}
