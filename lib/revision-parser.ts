import { debugLogger } from "./debug-logger"
import type { RevisionHistoryItem } from "./law-types"

export interface RevisionInfo {
  promulgationDate: string
  promulgationNumber: string
  revisionType: string
  effectiveDate?: string
  lawName: string
}

export function parseArticleHistoryXML(xmlText: string): RevisionHistoryItem[] {
  debugLogger.info("조문 개정이력 XML 파싱 시작", { xmlLength: xmlText.length })

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      throw new Error("XML 파싱 오류")
    }

    const history: RevisionHistoryItem[] = []

    // Try to find revision history elements
    const revisionElements = xmlDoc.querySelectorAll("연혁, 개정이력, Revision")

    revisionElements.forEach((element) => {
      const date = element.querySelector("공포일자, 공포일, PromulgationDate")?.textContent || ""
      const type = element.querySelector("제개정구분, 제개정구분명, RevisionType")?.textContent || ""
      const description = element.querySelector("개정사유, 개정내용, Description")?.textContent
      const articleLink = element.querySelector("조문링크, ArticleLink")?.textContent

      if (date || type) {
        history.push({
          date: formatDate(date),
          type: type || "개정",
          description,
          articleLink,
        })
      }
    })

    debugLogger.success("조문 개정이력 파싱 완료", { count: history.length })
    return history
  } catch (error) {
    debugLogger.error("조문 개정이력 파싱 실패", error)
    return []
  }
}

export function parseRevisionHistoryXML(xmlText: string): RevisionInfo[] {
  debugLogger.info("개정이력 XML 파싱 시작", { xmlLength: xmlText.length })

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      throw new Error("XML 파싱 오류")
    }

    console.log("[v0] [개정이력] XML root element:", xmlDoc.documentElement.tagName)
    console.log("[v0] [개정이력] XML sample (first 2000 chars):", xmlText.substring(0, 2000))

    const allElements = xmlDoc.getElementsByTagName("*")
    const elementNames = new Set<string>()
    for (let i = 0; i < Math.min(allElements.length, 100); i++) {
      elementNames.add(allElements[i].tagName)
    }
    console.log("[v0] [개정이력] Available XML elements:", Array.from(elementNames).join(", "))

    const revisions: RevisionInfo[] = []

    const selectors = [
      "법령 > 법령연혁 > 연혁",
      "법령연혁 > 연혁",
      "연혁",
      "법령",
      "law",
      "LawInfo",
      "기본정보",
      "법령기본정보",
      "개정이력",
      "개정정보",
      "RevisionHistory",
      "Revision",
    ]

    let lawElements: NodeListOf<Element> | null = null
    let usedSelector = ""

    for (const selector of selectors) {
      const elements = xmlDoc.querySelectorAll(selector)
      if (elements.length > 0) {
        console.log(`[v0] [개정이력] Found ${elements.length} entries using selector: "${selector}"`)
        lawElements = elements
        usedSelector = selector
        break
      }
    }

    if (!lawElements || lawElements.length === 0) {
      console.log("[v0] [개정이력] No revision entries found with any selector")
      return []
    }

    console.log(`[v0] [개정이력] Using selector "${usedSelector}" - found ${lawElements.length} entries`)

    lawElements.forEach((law, index) => {
      // Log the element structure for debugging
      if (index < 3) {
        console.log(
          `[v0] [개정이력] Element ${index + 1} children:`,
          Array.from(law.children)
            .map((c) => c.tagName)
            .join(", "),
        )
      }

      const promulgationDate =
        law.querySelector("공포일자")?.textContent ||
        law.querySelector("공포일")?.textContent ||
        law.querySelector("PromulgationDate")?.textContent ||
        law.querySelector("공포년월일")?.textContent ||
        law.querySelector("공포날짜")?.textContent ||
        ""

      const promulgationNumber =
        law.querySelector("공포번호")?.textContent ||
        law.querySelector("공포번")?.textContent ||
        law.querySelector("PromulgationNumber")?.textContent ||
        law.querySelector("공포호")?.textContent ||
        ""

      const revisionType =
        law.querySelector("제개정구분")?.textContent ||
        law.querySelector("제개정구분명")?.textContent ||
        law.querySelector("제개정")?.textContent ||
        law.querySelector("RevisionType")?.textContent ||
        law.querySelector("개정구분")?.textContent ||
        law.querySelector("개정종류")?.textContent ||
        law.querySelector("개정타입")?.textContent ||
        ""

      const effectiveDate =
        law.querySelector("시행일자")?.textContent ||
        law.querySelector("시행일")?.textContent ||
        law.querySelector("EffectiveDate")?.textContent ||
        law.querySelector("시행년월일")?.textContent ||
        law.querySelector("시행날짜")?.textContent ||
        ""

      const lawName =
        law.querySelector("법령명_한글")?.textContent ||
        law.querySelector("법령명한글")?.textContent ||
        law.querySelector("법령명")?.textContent ||
        law.querySelector("LawName")?.textContent ||
        law.querySelector("법령이름")?.textContent ||
        ""

      if (index < 3) {
        console.log(`[v0] [개정이력] Parsed revision ${index + 1}:`, {
          promulgationDate,
          promulgationNumber,
          revisionType,
          effectiveDate,
          lawName,
        })
      }

      if (promulgationDate || promulgationNumber) {
        revisions.push({
          promulgationDate: promulgationDate || "날짜미상",
          promulgationNumber: promulgationNumber || "번호미상",
          revisionType: revisionType || "개정",
          effectiveDate,
          lawName: lawName || "",
        })
      }
    })

    console.log("[v0] [개정이력] Total revisions parsed:", revisions.length)
    if (revisions.length > 0) {
      console.log(
        "[v0] [개정이력] First 5 revisions:",
        revisions
          .slice(0, 5)
          .map((r) => `${r.promulgationDate} ${r.revisionType}`)
          .join(", "),
      )
    }

    debugLogger.success("개정이력 파싱 완료", { count: revisions.length })
    return revisions
  } catch (error) {
    console.log("[v0] [개정이력] Revision parsing error:", error)
    debugLogger.error("개정이력 파싱 실패", error)
    return []
  }
}

export function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr
  return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`
}

export function extractArticleRevisions(
  revisions: Array<{ date: string; type: string }> | undefined,
): RevisionHistoryItem[] {
  if (!revisions || revisions.length === 0) return []

  return revisions.map((rev) => ({
    date: rev.date,
    type: rev.type,
    description: undefined,
  }))
}
