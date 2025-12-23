import { debugLogger } from "./debug-logger"

export interface OrdinanceSearchResult {
  ordinSeq: string // 자치법규일련번호
  ordinName: string // 자치법규명
  ordinId: string // 자치법규ID
  promulgationDate?: string // 공포일자
  promulgationNumber?: string // 공포번호
  revisionType?: string // 제개정구분명
  orgName?: string // 지자체기관명
  ordinKind?: string // 자치법규종류
  effectiveDate?: string // 시행일자
  ordinField?: string // 자치법규분야명
}

export function parseOrdinanceSearchXML(xmlText: string): { totalCount: number; ordinances: OrdinanceSearchResult[] } {
  try {

    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    // Check for parsing errors
    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      console.log("XML parsing error:", parserError.textContent)
      throw new Error("XML 파싱 오류")
    }

    // ✅ totalCnt 파싱 (판례 API와 동일한 형식)
    const totalCnt = xmlDoc.querySelector("totalCnt")?.textContent || "0"
    const totalCount = parseInt(totalCnt, 10) || 0

    const ordinances = xmlDoc.querySelectorAll("law")
    console.log("Found ordinances:", ordinances.length, "totalCount:", totalCount)

    const results: OrdinanceSearchResult[] = []

    ordinances.forEach((ordin) => {
      const ordinSeq = ordin.querySelector("자치법규일련번호")?.textContent || ""
      const ordinName = ordin.querySelector("자치법규명")?.textContent || ""
      const ordinId = ordin.querySelector("자치법규ID")?.textContent || ""
      const promulgationDate = ordin.querySelector("공포일자")?.textContent || ""
      const promulgationNumber = ordin.querySelector("공포번호")?.textContent || ""
      const revisionType = ordin.querySelector("제개정구분명")?.textContent || ""
      const orgName = ordin.querySelector("지자체기관명")?.textContent || ""
      const ordinKind = ordin.querySelector("자치법규종류")?.textContent || ""
      const effectiveDate = ordin.querySelector("시행일자")?.textContent || ""
      const ordinField = ordin.querySelector("자치법규분야명")?.textContent || ""

      if (ordinSeq && ordinName) {
        results.push({
          ordinSeq,
          ordinName,
          ordinId,
          promulgationDate,
          promulgationNumber,
          revisionType,
          orgName,
          ordinKind,
          effectiveDate,
          ordinField,
        })
      }
    })

    return { totalCount, ordinances: results }
  } catch (error) {
    console.log("Ordinance search parsing error:", error)
    debugLogger.error("자치법규 검색 결과 파싱 실패", error)
    return { totalCount: 0, ordinances: [] }
  }
}
