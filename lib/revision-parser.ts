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
  console.log("[v0] Received revision history XML, length:", xmlText.length)

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      console.log("[v0] XML parsing error:", parserError.textContent)
      throw new Error("XML 파싱 오류")
    }

    console.log("[v0] XML root element:", xmlDoc.documentElement.tagName)
    console.log("[v0] XML sample (first 1000 chars):", xmlText.substring(0, 1000))

    const history: RevisionHistoryItem[] = []

    const lawElements = xmlDoc.querySelectorAll("law")
    console.log("[v0] Found law elements:", lawElements.length)

    if (lawElements.length === 0) {
      console.log("[v0] No <law> elements found, trying alternative selectors")
      return []
    }

    lawElements.forEach((law, index) => {
      const lawInfo = law.querySelector("법령정보")
      if (!lawInfo) {
        console.log(`[v0] No 법령정보 found in law element ${index}`)
        return
      }

      const promulgationDate = lawInfo.querySelector("공포일자")?.textContent?.trim() || ""
      const promulgationNumber = lawInfo.querySelector("공포번호")?.textContent?.trim() || ""
      const revisionType = lawInfo.querySelector("제개정구분명")?.textContent?.trim() || ""
      const effectiveDate = lawInfo.querySelector("시행일자")?.textContent?.trim() || ""

      const articleInfo = law.querySelector("조문정보")
      const changeReason = articleInfo?.querySelector("변경사유")?.textContent?.trim() || ""
      const articleLinkRaw = articleInfo?.querySelector("조문링크")?.textContent?.trim() || ""
      const articleLink = articleLinkRaw ? `https://www.law.go.kr${articleLinkRaw}` : ""

      if (index < 3) {
        console.log(`[v0] Parsed revision ${index + 1}:`, {
          promulgationDate,
          promulgationNumber,
          revisionType,
          changeReason,
          effectiveDate,
          hasArticleLink: !!articleLink,
        })
      }

      if (promulgationDate) {
        const formattedDate = formatDate(promulgationDate)

        let description = revisionType
        if (changeReason && changeReason !== revisionType) {
          description += ` (${changeReason})`
        }

        history.push({
          date: formattedDate,
          type: changeReason || revisionType || "개정",
          description: revisionType,
          articleLink: articleLink || undefined,
        })
      }
    })

    console.log("[v0] Parsed revision history:", history.length, "items")
    if (history.length > 0) {
      console.log("[v0] First 3 revisions:", history.slice(0, 3))
    }

    debugLogger.success("조문 개정이력 파싱 완료", { count: history.length })
    return history
  } catch (error) {
    console.log("[v0] Revision parsing error:", error)
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
  return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
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
