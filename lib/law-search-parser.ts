import { debugLogger } from "./debug-logger"

export interface LawSearchResult {
  lawId?: string
  mst?: string
  lawName: string
  lawType: string
  promulgationDate?: string
  effectiveDate?: string
}

function normalizeDateFormat(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined

  // Remove all non-digit characters (dots, dashes, spaces)
  const cleaned = dateStr.replace(/[^\d]/g, "")

  // Validate it's 8 digits (YYYYMMDD)
  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    return cleaned
  }

  console.log(`Invalid date format, skipping: "${dateStr}"`)
  return undefined
}

export function parseLawSearchXML(xmlText: string): LawSearchResult[] {
  try {

    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    // Check for parsing errors
    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      console.log("XML parsing error:", parserError.textContent)
      throw new Error("XML 파싱 오류")
    }

    const laws = xmlDoc.querySelectorAll("law")
    console.log("Found laws:", laws.length)

    const results: LawSearchResult[] = []

    laws.forEach((law) => {
      const rawLawId = law.querySelector("법령ID")?.textContent?.trim()
      const mst = law.querySelector("법령일련번호")?.textContent?.trim()
      const lawName = law.querySelector("법령명한글")?.textContent || ""
      const lawType = law.querySelector("법령구분명")?.textContent || ""
      const rawPromulgationDate = law.querySelector("공포일자")?.textContent || ""
      const rawEffectiveDate = law.querySelector("시행일자")?.textContent || ""

      const promulgationDate = normalizeDateFormat(rawPromulgationDate)
      const effectiveDate = normalizeDateFormat(rawEffectiveDate)

      if ((rawLawId || mst) && lawName) {
        const normalizedLawId = rawLawId || undefined
        results.push({
          lawId: normalizedLawId,
          mst,
          lawName,
          lawType,
          promulgationDate,
          effectiveDate,
        })
        console.log("Parsed law:", {
          lawId: normalizedLawId,
          mst,
          lawName,
          lawType,
          promulgationDate,
          effectiveDate,
        })
      }
    })

    return results
  } catch (error) {
    console.log("Law search parsing error:", error)
    debugLogger.error("법령 검색 결과 파싱 실패", error)
    return []
  }
}
