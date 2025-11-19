import type { OldNewComparison } from "./law-types"
import { debugLogger } from "./debug-logger"

export function parseOldNewXML(xmlText: string, targetJo?: string): OldNewComparison {
  debugLogger.info("신·구법 XML 파싱 시작", { xmlLength: xmlText.length, targetJo })

  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, "text/xml")

  console.log("[v0] [DEBUG] XML 샘플 (첫 1000자):", xmlText.substring(0, 1000))

  let targetMain: number | null = null
  let targetSub: number | null = null

  if (targetJo) {
    targetMain = Number.parseInt(targetJo.substring(0, 4), 10)
    const subNum = Number.parseInt(targetJo.substring(4, 6), 10)
    targetSub = subNum === 0 ? null : subNum
  }

  // Extract old version metadata
  const oldInfo = xmlDoc.querySelector("구조문_기본정보")
  console.log("[v0] [DEBUG] 구조문_기본정보 존재:", !!oldInfo)
  if (oldInfo) {
    console.log("[v0] [DEBUG] 구조문_기본정보 내용:", oldInfo.outerHTML?.substring(0, 500))
  }

  const oldEffectiveDate = oldInfo?.querySelector("시행일자")?.textContent || undefined
  const oldPromulgationDate = oldInfo?.querySelector("공포일자")?.textContent || undefined
  const oldPromulgationNumber = oldInfo?.querySelector("공포번호")?.textContent || undefined

  console.log("[v0] [DEBUG] 구법 메타데이터:", {
    effectiveDate: oldEffectiveDate,
    promulgationDate: oldPromulgationDate,
    promulgationNumber: oldPromulgationNumber,
  })

  // Extract new version metadata
  const newInfo = xmlDoc.querySelector("신조문_기본정보")
  console.log("[v0] [DEBUG] 신조문_기본정보 존재:", !!newInfo)

  const newEffectiveDate = newInfo?.querySelector("시행일자")?.textContent || undefined
  const newPromulgationDate = newInfo?.querySelector("공포일자")?.textContent || undefined
  const newPromulgationNumber = newInfo?.querySelector("공포번호")?.textContent || undefined

  const lawId =
    newInfo?.querySelector("법령ID")?.textContent || oldInfo?.querySelector("법령ID")?.textContent || undefined
  const lawTitle =
    newInfo?.querySelector("법령명")?.textContent || oldInfo?.querySelector("법령명")?.textContent || "알 수 없는 법령"
  const mst = lawTitle

  console.log("[v0] [DEBUG] 신법 메타데이터:", {
    effectiveDate: newEffectiveDate,
    promulgationDate: newPromulgationDate,
    promulgationNumber: newPromulgationNumber,
    lawId,
    lawTitle,
  })

  const oldArticles = xmlDoc.querySelectorAll("구조문목록 > 조문")
  let oldContent = ""

  if (targetMain !== null) {
    let collecting = false

    for (const article of oldArticles) {
      const content = article.textContent || ""

      const joMatch = content.match(/^제(\d+)조(?:의(\d+))?/)

      if (joMatch) {
        const articleMain = Number.parseInt(joMatch[1])
        const articleSub = joMatch[2] ? Number.parseInt(joMatch[2]) : null

        if (collecting) {
          if (articleMain !== targetMain || articleSub !== targetSub) {
            break
          }
        }

        if (articleMain === targetMain && articleSub === targetSub) {
          collecting = true
          oldContent += content + "\n\n"
        }
      } else if (collecting) {
        oldContent += content + "\n\n"
      }
    }
  } else {
    for (const article of oldArticles) {
      oldContent += (article.textContent || "") + "\n\n"
    }
  }

  const newArticles = xmlDoc.querySelectorAll("신조문목록 > 조문")
  let newContent = ""

  if (targetMain !== null) {
    let collecting = false

    for (const article of newArticles) {
      const content = article.textContent || ""

      const joMatch = content.match(/^제(\d+)조(?:의(\d+))?/)

      if (joMatch) {
        const articleMain = Number.parseInt(joMatch[1])
        const articleSub = joMatch[2] ? Number.parseInt(joMatch[2]) : null

        if (collecting) {
          if (articleMain !== targetMain || articleSub !== targetSub) {
            break
          }
        }

        if (articleMain === targetMain && articleSub === targetSub) {
          collecting = true
          newContent += content + "\n\n"
        }
      } else if (collecting) {
        newContent += content + "\n\n"
      }
    }
  } else {
    for (const article of newArticles) {
      newContent += (article.textContent || "") + "\n\n"
    }
  }

  const oldPTags = (oldContent.match(/<P>/g) || []).length
  const newPTags = (newContent.match(/<P>/g) || []).length
  const changeCount = Math.max(oldPTags, newPTags)

  debugLogger.success("신·구법 XML 파싱 완료", { changeCount })

  return {
    oldVersion: {
      content: oldContent,
      effectiveDate: oldEffectiveDate,
      promulgationDate: oldPromulgationDate,
      promulgationNumber: oldPromulgationNumber,
    },
    newVersion: {
      content: newContent,
      effectiveDate: newEffectiveDate,
      promulgationDate: newPromulgationDate,
      promulgationNumber: newPromulgationNumber,
    },
    changes: Array(changeCount).fill({ type: "modified" }),
    meta: {
      lawId,
      mst,
      lawTitle,
      latestEffectiveDate: newEffectiveDate,
      promulgation: {
        date: newPromulgationDate,
        number: newPromulgationNumber,
      },
      revisionType: newInfo?.querySelector("제개정구분명")?.textContent || undefined,
      fetchedAt: new Date().toISOString(),
    },
  }
}

export function highlightDifferences(
  oldContent: string,
  newContent: string,
): { oldHighlighted: string; newHighlighted: string } {
  console.log("[v0] Highlighting differences...")

  let oldHighlighted = oldContent
    .replace(
      /<P>/g,
      '<span style="background: linear-gradient(to right, rgba(251, 113, 133, 0.15), rgba(251, 113, 133, 0.08)); color: rgb(244, 63, 94); font-weight: 500; padding: 2px 6px; border-radius: 4px; border-left: 2px solid rgba(244, 63, 94, 0.4);">',
    )
    .replace(/<\/P>/g, "</span>")

  let newHighlighted = newContent
    .replace(
      /<P>/g,
      '<span style="background: linear-gradient(to right, rgba(52, 211, 153, 0.15), rgba(52, 211, 153, 0.08)); color: rgb(16, 185, 129); font-weight: 500; padding: 2px 6px; border-radius: 4px; border-left: 2px solid rgba(16, 185, 129, 0.4);">',
    )
    .replace(/<\/P>/g, "</span>")

  const articlePattern = /^(제\d+조(?:의\d+)?(?:의\d+)?)/gm

  oldHighlighted = oldHighlighted.replace(
    articlePattern,
    '<div style="border-top: 2px solid rgba(148, 163, 184, 0.3); margin: 2rem 0 1rem 0; padding-top: 1rem;"></div>$1',
  )

  newHighlighted = newHighlighted.replace(
    articlePattern,
    '<div style="border-top: 2px solid rgba(148, 163, 184, 0.3); margin: 2rem 0 1rem 0; padding-top: 1rem;"></div>$1',
  )

  // Convert line breaks to <br> for proper display
  oldHighlighted = oldHighlighted.replace(/\n/g, "<br>")
  newHighlighted = newHighlighted.replace(/\n/g, "<br>")

  console.log("[v0] Highlighting complete")

  return { oldHighlighted, newHighlighted }
}
