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
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      throw new Error("XML 파싱 오류")
    }

    const history: RevisionHistoryItem[] = []
    const lawElements = xmlDoc.querySelectorAll("law")

    if (lawElements.length === 0) {
      return []
    }

    lawElements.forEach((law) => {
      const lawInfo = law.querySelector("법령정보")
      if (!lawInfo) return

      const promulgationDate = lawInfo.querySelector("공포일자")?.textContent?.trim() || ""
      const revisionType = lawInfo.querySelector("제개정구분명")?.textContent?.trim() || ""

      const articleInfo = law.querySelector("조문정보")
      const changeReason = articleInfo?.querySelector("변경사유")?.textContent?.trim() || ""
      const articleLinkRaw = articleInfo?.querySelector("조문링크")?.textContent?.trim() || ""
      const articleLink = articleLinkRaw ? `https://www.law.go.kr${articleLinkRaw}` : ""

      if (promulgationDate) {
        const formattedDate = formatDate(promulgationDate)

        history.push({
          date: formattedDate,
          type: changeReason || revisionType || "개정",
          description: revisionType,
          articleLink: articleLink || undefined,
        })
      }
    })

    return history
  } catch (error) {
    debugLogger.error("조문 개정이력 파싱 실패", error)
    return []
  }
}

export function parseRevisionHistoryXML(xmlText: string): RevisionInfo[] {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      throw new Error("XML 파싱 오류")
    }

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

    for (const selector of selectors) {
      const elements = xmlDoc.querySelectorAll(selector)
      if (elements.length > 0) {
        lawElements = elements
        break
      }
    }

    if (!lawElements || lawElements.length === 0) {
      return []
    }

    lawElements.forEach((law) => {
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

    return revisions
  } catch (error) {
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
