import { debugLogger } from './debug-logger'

export interface LawHierarchy {
  lawId: string
  lawName: string
  mst: string
  promulgationDate?: string
  effectiveDate?: string
  upperLaws?: {
    lawId: string
    lawName: string
    mst: string
  }[]
  lowerLaws?: {
    lawId: string
    lawName: string
    mst: string
    type: "decree" | "rule" | "other"
  }[]
  adminRules?: {
    id: string
    name: string
    serialNumber?: string
  }[]
}

/**
 * 법령 체계도 XML 파싱
 */
export function parseHierarchyXML(xmlText: string): LawHierarchy | null {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      debugLogger.error("[hierarchy-parser] XML parsing error")
      return null
    }

    // 기본 정보
    const lawId = xmlDoc.querySelector("기본정보 법령ID")?.textContent?.trim() || ""
    const lawName = xmlDoc.querySelector("기본정보 법령명, 법령명")?.textContent?.trim() || ""
    const mst = xmlDoc.querySelector("기본정보 법령일련번호, 법령일련번호")?.textContent?.trim() || ""
    const promulgationDate = xmlDoc.querySelector("기본정보 공포일자")?.textContent?.trim()
    const effectiveDate = xmlDoc.querySelector("기본정보 시행일자")?.textContent?.trim()

    if (!lawId && !lawName) {
      debugLogger.error("[hierarchy-parser] No law ID or name found")
      return null
    }

    // 상위법 파싱
    const upperLaws: LawHierarchy["upperLaws"] = []
    const upperLawElements = xmlDoc.querySelectorAll("상하위법 법률, 상위법")

    upperLawElements.forEach((elem) => {
      const upperLawName = elem.textContent?.trim()
      const upperLawId = elem.getAttribute("법령ID") || elem.getAttribute("ID") || ""
      const upperMst = elem.getAttribute("법령일련번호") || elem.getAttribute("MST") || ""

      if (upperLawName) {
        upperLaws.push({
          lawId: upperLawId,
          lawName: upperLawName,
          mst: upperMst,
        })
      }
    })

    // 하위법 파싱 (시행령, 시행규칙)
    const lowerLaws: LawHierarchy["lowerLaws"] = []

    // 시행령
    const decreeElements = xmlDoc.querySelectorAll("상하위법 시행령, 하위법 시행령")
    decreeElements.forEach((elem) => {
      const decreeName = elem.textContent?.trim()
      const decreeId = elem.getAttribute("법령ID") || elem.getAttribute("ID") || ""
      const decreeMst = elem.getAttribute("법령일련번호") || elem.getAttribute("MST") || ""

      if (decreeName) {
        lowerLaws.push({
          lawId: decreeId,
          lawName: decreeName,
          mst: decreeMst,
          type: "decree",
        })
      }
    })

    // 시행규칙
    const ruleElements = xmlDoc.querySelectorAll("상하위법 시행규칙, 하위법 시행규칙")
    ruleElements.forEach((elem) => {
      const ruleName = elem.textContent?.trim()
      const ruleId = elem.getAttribute("법령ID") || elem.getAttribute("ID") || ""
      const ruleMst = elem.getAttribute("법령일련번호") || elem.getAttribute("MST") || ""

      if (ruleName) {
        lowerLaws.push({
          lawId: ruleId,
          lawName: ruleName,
          mst: ruleMst,
          type: "rule",
        })
      }
    })

    // 행정규칙 파싱 (고시, 예규, 훈령 등)
    const adminRules: LawHierarchy["adminRules"] = []
    const adminRulesMap = new Map<string, { id: string; name: string; serialNumber?: string }>()

    // 훈령, 예규, 고시 등 모든 행정규칙의 기본정보 선택
    const adminRuleElements = xmlDoc.querySelectorAll("행정규칙 훈령 기본정보, 행정규칙 예규 기본정보, 행정규칙 고시 기본정보, 행정규칙 공고 기본정보, 행정규칙 지침 기본정보, 행정규칙 기타 기본정보")

    adminRuleElements.forEach((elem) => {
      const adminRuleName = elem.querySelector("행정규칙명")?.textContent?.trim()
      const adminRuleId = elem.querySelector("행정규칙ID")?.textContent?.trim() || ""
      const adminRuleSerialNumber = elem.querySelector("행정규칙일련번호")?.textContent?.trim()

      if (adminRuleName) {
        // serialNumber를 우선 키로 사용하고, 없으면 id 사용하여 중복 제거
        const uniqueKey = adminRuleSerialNumber || adminRuleId

        if (uniqueKey && !adminRulesMap.has(uniqueKey)) {
          adminRulesMap.set(uniqueKey, {
            id: adminRuleId,
            name: adminRuleName,
            serialNumber: adminRuleSerialNumber,
          })
        }
      }
    })

    // Map을 배열로 변환
    adminRules.push(...Array.from(adminRulesMap.values()))

    return {
      lawId,
      lawName,
      mst,
      promulgationDate,
      effectiveDate,
      upperLaws: upperLaws.length > 0 ? upperLaws : undefined,
      lowerLaws: lowerLaws.length > 0 ? lowerLaws : undefined,
      adminRules: adminRules.length > 0 ? adminRules : undefined,
    }
  } catch (error) {
    debugLogger.error("[hierarchy-parser] Error:", error)
    return null
  }
}

/**
 * 법령 체계도 목록 검색 결과 파싱
 */
export function parseHierarchySearchXML(xmlText: string): Array<{
  lawId: string
  lawName: string
  mst: string
  promulgationDate?: string
  effectiveDate?: string
}> {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      debugLogger.error("[hierarchy-parser] XML parsing error")
      return []
    }

    const results: Array<{
      lawId: string
      lawName: string
      mst: string
      promulgationDate?: string
      effectiveDate?: string
    }> = []

    const lawElements = xmlDoc.querySelectorAll("law")

    lawElements.forEach((elem) => {
      const lawId = elem.querySelector("법령ID")?.textContent?.trim() || ""
      const lawName = elem.querySelector("법령명")?.textContent?.trim() || ""
      const mst = elem.querySelector("법령일련번호")?.textContent?.trim() || ""
      const promulgationDate = elem.querySelector("공포일자")?.textContent?.trim()
      const effectiveDate = elem.querySelector("시행일자")?.textContent?.trim()

      if (lawId || lawName) {
        results.push({
          lawId,
          lawName,
          mst,
          promulgationDate,
          effectiveDate,
        })
      }
    })

    return results
  } catch (error) {
    debugLogger.error("[hierarchy-parser] Error:", error)
    return []
  }
}
