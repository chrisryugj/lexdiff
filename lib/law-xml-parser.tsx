import type { LawArticle, LawParagraph, LawItem, LawMeta } from "./law-types"
import { debugLogger } from "./debug-logger"
import { buildJO } from "./law-parser"

export function parseLawXML(xmlText: string): {
  meta: LawMeta
  articles: LawArticle[]
} {
  debugLogger.debug("XML 파싱 시작", { length: xmlText.length })

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      throw new Error("XML 파싱 오류")
    }

    const meta = extractMetadata(xmlDoc)
    const articles = extractArticles(xmlDoc)

    debugLogger.success("XML 파싱 완료", { articleCount: articles.length })

    return { meta, articles }
  } catch (error) {
    debugLogger.error("XML 파싱 실패", error)
    throw error
  }
}

function extractMetadata(xmlDoc: Document): LawMeta {
  const lawId = xmlDoc.querySelector("기본정보 법령ID")?.textContent || undefined
  const mst = xmlDoc.querySelector("기본정보 법령일련번호")?.textContent || undefined
  const lawTitle = xmlDoc.querySelector("기본정보 법령명_한글")?.textContent || "알 수 없는 법령"
  const efYd = xmlDoc.querySelector("기본정보 시행일자")?.textContent || undefined
  const promDate = xmlDoc.querySelector("기본정보 공포일자")?.textContent || undefined
  const promNum = xmlDoc.querySelector("기본정보 공포번호")?.textContent || undefined
  const revType = xmlDoc.querySelector("기본정보 제개정구분")?.textContent || undefined

  return {
    lawId,
    mst,
    lawTitle,
    latestEffectiveDate: efYd,
    promulgation: promDate || promNum ? { date: promDate, number: promNum } : undefined,
    revisionType: revType,
    fetchedAt: new Date().toISOString(),
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .trim()
}

function extractTitleFromContent(content: string): string | undefined {
  const normalized = normalizeText(content)

  let match = normalized.match(/제\s*\d+\s*조(?:의\d+)?\s*$$([^)]+)$$/)
  if (match) {
    return match[1].trim()
  }

  match = normalized.match(/제\s*\d+\s*조(?:의\d+)?\s*（([^）]+)）/)
  if (match) {
    return match[1].trim()
  }

  match = normalized.match(/제\s*\d+\s*조(?:의\d+)?[^(（]*[（(]\s*([^)）]+?)\s*[）)]/s)
  if (match) {
    return match[1].trim()
  }

  return undefined
}

function extractArticles(xmlDoc: Document): LawArticle[] {
  const articles: LawArticle[] = []
  const joElements = xmlDoc.querySelectorAll("조문")

  joElements.forEach((joElement) => {
    let joNum = joElement.querySelector("조문번호")?.textContent || ""
    let joTitle = joElement.querySelector("조문제목")?.textContent?.trim() || undefined
    const joContent = joElement.querySelector("조문내용")?.textContent || ""
    const hasChanges = joElement.querySelector("조문변경여부")?.textContent === "Y"

    const revisionHistory = extractRevisionMarks(joContent, joElement)

    if (joContent && (!joNum.includes("조") || !joNum.includes("의"))) {
      const joMatch = joContent.match(/제(\d+)조(?:의(\d+))?/)
      if (joMatch) {
        const mainNum = joMatch[1]
        const subNum = joMatch[2]
        if (subNum) {
          joNum = mainNum + "조의" + subNum
        } else if (!joNum.includes("조")) {
          joNum = mainNum + "조"
        }
      }
    }

    if (!joTitle && joContent) {
      joTitle = extractTitleFromContent(joContent)
    }

    let normalizedJo = joNum
    if (joNum) {
      try {
        normalizedJo = buildJO(joNum)
      } catch (error) {
        if (joNum.length < 6) {
          const articleNum = Number.parseInt(joNum, 10)
          if (!isNaN(articleNum)) {
            normalizedJo = articleNum.toString().padStart(4, "0") + "00"
          }
        }
      }
    }

    const paragraphs: LawParagraph[] = []
    const hangElements = joElement.querySelectorAll("항")

    hangElements.forEach((hangElement) => {
      const hangNum = hangElement.querySelector("항번호")?.textContent || ""
      const hangContent = hangElement.querySelector("항내용")?.textContent || ""

      const items: LawItem[] = []
      const hoElements = hangElement.querySelectorAll("호")

      hoElements.forEach((hoElement) => {
        const hoNum = hoElement.querySelector("호번호")?.textContent || ""
        const hoContent = hoElement.querySelector("호내용")?.textContent || ""

        items.push({
          num: hoNum,
          content: hoContent,
        })
      })

      paragraphs.push({
        num: hangNum,
        content: hangContent,
        items: items.length > 0 ? items : undefined,
      })
    })

    articles.push({
      jo: normalizedJo,
      joNum,
      title: joTitle,
      content: joContent,
      hasChanges,
      paragraphs: paragraphs.length > 0 ? paragraphs : undefined,
      revisionHistory: revisionHistory.length > 0 ? revisionHistory : undefined,
    })
  })

  return articles
}

function extractRevisionMarks(
  content: string,
  joElement?: Element,
): Array<{ date: string; type: string; description?: string }> {
  const revisions: Array<{ date: string; type: string; description?: string }> = []

  const halfWidthPattern = /<(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)>/g
  let match: RegExpExecArray | null

  while ((match = halfWidthPattern.exec(content)) !== null) {
    const dateStr = match[2].replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, "").trim()
    if (dateStr.length === 8) {
      revisions.push({
        type: match[1],
        date: dateStr,
      })
    }
  }

  const fullWidthPattern = /＜(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)＞/g

  while ((match = fullWidthPattern.exec(content)) !== null) {
    const dateStr = match[2].replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, "").trim()
    if (dateStr.length === 8) {
      revisions.push({
        type: match[1],
        date: dateStr,
      })
    }
  }

  const squareBracketPattern = /\[(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)\]/g

  while ((match = squareBracketPattern.exec(content)) !== null) {
    const dateStr = match[2].replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, "").trim()
    if (dateStr.length === 8) {
      revisions.push({
        type: match[1],
        date: dateStr,
      })
    }
  }

  if (joElement) {
    const revisionElements = joElement.querySelectorAll("개정이력, 연혁, 개정, revision")

    revisionElements.forEach((revEl) => {
      const dateEl =
        revEl.querySelector("개정일자, 공포일자, 일자, date") ||
        revEl.querySelector("개정일, 공포일") ||
        revEl.querySelector("날짜")

      const typeEl =
        revEl.querySelector("개정구분, 제개정구분, 구분, type") ||
        revEl.querySelector("개정종류, 종류") ||
        revEl.querySelector("개정타입")

      const descEl = revEl.querySelector("개정내용, 내용, 설명, description")

      const dateText = dateEl?.textContent?.trim() || ""
      const typeText = typeEl?.textContent?.trim() || "개정"
      const descText = descEl?.textContent?.trim()

      if (dateText) {
        const cleanDate = dateText.replace(/[.\-\s]/g, "")
        if (cleanDate.length === 8 && /^\d{8}$/.test(cleanDate)) {
          revisions.push({
            type: typeText,
            date: cleanDate,
            description: descText,
          })
        }
      }
    })

    const hangElements = joElement.querySelectorAll("항, 호")
    hangElements.forEach((hangEl) => {
      const hangContent = hangEl.textContent || ""

      const hangRevPattern = /<(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)>/g
      let hangMatch: RegExpExecArray | null

      while ((hangMatch = hangRevPattern.exec(hangContent)) !== null) {
        const dateStr = hangMatch[2].replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, "").trim()
        if (dateStr.length === 8) {
          revisions.push({
            type: hangMatch[1],
            date: dateStr,
          })
        }
      }
    })
  }

  const uniqueRevisions = Array.from(new Map(revisions.map((r) => [r.date + "-" + r.type, r])).values()).sort((a, b) =>
    b.date.localeCompare(a.date),
  )

  return uniqueRevisions
}

export function extractArticleText(article: LawArticle, isOrdinance = false): string {
  let text = ""

  if (article.content) {
    let content = escapeHtml(article.content)
    content = applyRevisionStyling(content)

    // Make article number and title bold BEFORE linkifying (for both laws and ordinances)
    // This catches patterns like "제1조(목적)" or "제1조" at the start
    content = content.replace(/^(제\d+조(?:의\d+)?(?:\s*\([^)]+\))?)/, '<strong>$1</strong>')

    content = isOrdinance ? linkifyOrdinanceRefs(content) : linkifyRefsB(content)

    // Replace 2+ newlines before paragraph markers with single newline
    content = content.replace(/\n{2,}\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g, '\n$1')

    // Convert all newlines to <br>
    content = content.replace(/\n/g, '<br>')

    // Add spacing for paragraph markers (①②③) - skip first occurrence
    let isFirst = true
    content = content.replace(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g, (match) => {
      if (isFirst) {
        isFirst = false
        return match
      }
      return '<span class="para-marker">' + match + '</span>'
    })
    text += content + "\n"
  }

  if (article.paragraphs) {
    article.paragraphs.forEach((para) => {
      const paraContent = para.content || ""
      const paraNum = para.num || ""

      const startsWithNumber = paraContent.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.)/)

      const styledParaContent = linkifyRefsB(applyRevisionStyling(escapeHtml(paraContent)))

      if (startsWithNumber) {
        text += "<br><br>" + styledParaContent + "<br>"
      } else if (paraNum) {
        text += "\n" + paraNum + ". " + styledParaContent + "\n"
      } else {
        text += "\n" + styledParaContent + "\n"
      }

      if (para.items) {
        para.items.forEach((item) => {
          const itemContent = item.content || ""
          const itemNum = item.num || ""

          const startsWithNumber = itemContent.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.)/)

          const styledItemContent = linkifyRefsB(applyRevisionStyling(escapeHtml(itemContent)))

          if (startsWithNumber) {
            text += "  " + styledItemContent + "\n"
          } else if (itemNum) {
            text += "  " + itemNum + ". " + styledItemContent + "\n"
          } else {
            text += "  " + styledItemContent + "\n"
          }
        })
      }
    })
  }

  return text.trim()
}

/**
 * Format delegation/citation content with the same styling as main articles
 * (For plain text content without structured paragraphs/items)
 */
export function formatDelegationContent(content: string): string {
  if (!content || content.trim().length === 0) {
    return ""
  }

  let text = escapeHtml(content)
  text = applyRevisionStyling(text)
  text = linkifyRefsB(text)

  // Add line break + spacing for paragraph markers (①②③) - skip first occurrence
  let isFirst = true
  text = text.replace(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g, (match) => {
    if (isFirst) {
      isFirst = false
      return match
    }
    return '<br><span class="para-marker">' + match + '</span>'
  })

  // Add line break for numbered items (1., 2., 3.) - but NOT dates
  text = text.replace(/(?<!\d\. )(\d+\.)\s+(?!\d+\.)/g, '<br>$1 ')

  // Add line break for sub-items (가., 나., 다.)
  text = text.replace(/([가-힣]\.)\s+/g, '<br>&nbsp;&nbsp;$1 ')

  return text
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function applyRevisionStyling(text: string): string {
  let styled = text

  // <개정>, ＜개정＞ 형식
  styled = styled.replace(
    /&lt;(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)&gt;/g,
    '<span class="rev-mark">＜$1 $2＞</span>',
  )

  styled = styled.replace(
    /＜(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)＞/g,
    '<span class="rev-mark">＜$1 $2＞</span>',
  )

  // "삭제<날짜>" 또는 "삭제 <날짜>" 형식
  styled = styled.replace(
    /(삭제)\s*&lt;([0-9., ]+)&gt;/g,
    '<span class="rev-mark">$1 ＜$2＞</span>',
  )

  styled = styled.replace(
    /(삭제)\s*＜([0-9., ]+)＞/g,
    '<span class="rev-mark">$1 ＜$2＞</span>',
  )

  // [본조신설], [종전 ~ 이동], [제X조에서 이동] 형식
  styled = styled.replace(
    /\[(본조신설|본조삭제)[^\]]*\]/g,
    '<span class="rev-mark">$&</span>',
  )

  styled = styled.replace(
    /\[종전[^\]]*\]/g,
    '<span class="rev-mark">$&</span>',
  )

  styled = styled.replace(
    /\[제\d+조[^\]]*에서 이동[^\]]*\]/g,
    '<span class="rev-mark">$&</span>',
  )

  return styled
}

function linkifyRefsB(text: string): string {
  let t = text

  // First, handle "같은 법" pattern by finding the last law name before each occurrence
  t = t.replace(/같은\s*법\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g, (match, art, _p1, branch, _p2, para, _p3, item, offset) => {
    // Find last 「법령명」 before this position
    const textBefore = t.substring(0, offset)
    const allLawMatches = textBefore.matchAll(/「\s*([^」]+)\s*」/g)
    const lawMatchesArray = Array.from(allLawMatches)

    if (lawMatchesArray.length > 0) {
      const lastLawMatch = lawMatchesArray[lawMatchesArray.length - 1]
      const lawName = lastLawMatch[1].trim()
      const joLabel = "제" + art + "조" +
        (branch ? "의" + branch : "") +
        (para ? "제" + para + "항" : "") +
        (item ? "제" + item + "호" : "")
      return (
        '<a href="#" class="law-ref" data-ref="law-article" data-law="' +
        lawName +
        '" data-article="' +
        joLabel +
        '">같은 법 ' +
        joLabel +
        "</a>"
      )
    }

    return match  // If no law found, keep original text
  })

  // 1. 「법령명」 제X조 패턴 (조문 번호 포함) - 항/호까지 포함
  t = t.replace(/「\s*([^」]+)\s*」\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g, (match, lawName, art, _p1, branch, _p2, para, _p3, item) => {
    const joLabel = "제" + art + "조" +
      (branch ? "의" + branch : "") +
      (para ? "제" + para + "항" : "") +
      (item ? "제" + item + "호" : "")
    return (
      '<a href="#" class="law-ref" data-ref="law-article" data-law="' +
      lawName +
      '" data-article="' +
      joLabel +
      '">「' +
      lawName +
      '」 ' +
      joLabel +
      "</a>"
    )
  })

  // 2. 「법령명」 단독 패턴 (조문 번호 없음)
  t = t.replace(/「\s*([^」]+)\s*」/g, (match, lawName) => {
    return '<a href="#" class="law-ref" data-ref="law" data-law="' + lawName + '">' + match + "</a>"
  })

  // 3. 법령명 제X조 패턴 (꺽쇄 없는 버전) - 항/호까지 포함
  // "법률 시행령"같이 법률 뒤에 다른 단어가 오는 경우 제외
  t = t.replace(/(?<!">)(?<!"data-article=")([가-힣A-Za-z\d·]+(?:법률|법|령|규칙|조례))(?!\s+[가-힣]+령)\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?(?!<\/a>)(?!["\)])/g, (match, lawName, art, _p1, branch, _p2, para, _p3, item) => {
    const joLabel = "제" + art + "조" +
      (branch ? "의" + branch : "") +
      (para ? "제" + para + "항" : "") +
      (item ? "제" + item + "호" : "")
    return (
      '<a href="#" class="law-ref" data-ref="law-article" data-law="' +
      lawName +
      '" data-article="' +
      joLabel +
      '">' +
      match +
      "</a>"
    )
  })

  // 4. XXX부령으로/로 정하는 패턴
  t = t.replace(
    /([가-힣]+부령)(?:으로|로)\s*정하는/g,
    (m, term) => '<a href="#" class="law-ref" data-ref="related" data-kind="rule">' + m + "</a>",
  )

  // 5. 대통령령으로 정하는 패턴
  t = t.replace(
    /(대통령령)(?:으로|로)\s*정하는/g,
    (m) => '<a href="#" class="law-ref" data-ref="related" data-kind="decree">' + m + "</a>",
  )

  // 6. XXX이/가 정하는 패턴 (관세청장이 정하는 등)
  t = t.replace(
    /([가-힣]+(?:청장|장관|부장관|차관|위원장|원장|이사장))(?:이|가)\s*정하는/g,
    (m) => '<a href="#" class="law-ref" data-ref="regulation" data-kind="administrative">' + m + "</a>",
  )

  // 7. 대통령령, 시행령 단독 (이미 링크된 텍스트 제외)
  t = t.replace(
    /(?<!">)(대통령령|시행령)(?![으로로이가<])/g,
    (m) => '<a href="#" class="law-ref" data-ref="related" data-kind="decree">' + m + "</a>",
  )

  // 8. 부령, 시행규칙 단독 (이미 링크된 텍스트 제외)
  t = t.replace(
    /(?<!">)((?:[가-힣]+)?부령|시행규칙)(?![으로로이가<])/g,
    (m) => '<a href="#" class="law-ref" data-ref="related" data-kind="rule">' + m + "</a>",
  )

  // 9. 제X조 패턴 (현재 법령의 조문) - 「법령명」 뒤에 오는 경우 제외
  t = t.replace(/(?<!」\s)제\s*([0-9]{1,4})\s*조(의\s*([0-9]{1,2}))?(?![제\d])/g, (m) => {
    const label = m
    const data = m.replace(/\s+/g, "")
    return '<a href="#" class="law-ref" data-ref="article" data-article="' + data + '">' + label + "</a>"
  })

  return t
}

// Ordinance-specific linkify function (removes internal article links)
function linkifyOrdinanceRefs(text: string): string {
  let t = text

  // 1. 「법령명」 제X조 패턴 - 외부 법령 참조만 링크
  t = t.replace(/「\s*([^」]+)\s*」\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g, (match, lawName, art, _p1, branch, _p2, para, _p3, item) => {
    const joLabel = "제" + art + "조" +
      (branch ? "의" + branch : "") +
      (para ? "제" + para + "항" : "") +
      (item ? "제" + item + "호" : "")
    return (
      '<a href="#" class="law-ref" data-ref="law-article" data-law="' +
      lawName +
      '" data-article="' +
      joLabel +
      '">「' +
      lawName +
      '」 ' +
      joLabel +
      "</a>"
    )
  })

  // 2. 「법령명」 단독 패턴
  t = t.replace(/「\s*([^」]+)\s*」/g, (match, lawName) => {
    return '<a href="#" class="law-ref" data-ref="law" data-law="' + lawName + '">' + match + "</a>"
  })

  // 3. 법령명 제X조 패턴 (꺽쇄 없는 버전) - 이미 링크되지 않은 경우만
  // Lookahead to avoid breaking mid-attribute
  t = t.replace(/(?<!">)(?<!"data-article=")([가-힣A-Za-z\d·]+법)\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?(?!<\/a>)(?!["\)])/g, (match, lawName, art, _p1, branch, _p2, para, _p3, item) => {
    const joLabel = "제" + art + "조" +
      (branch ? "의" + branch : "") +
      (para ? "제" + para + "항" : "") +
      (item ? "제" + item + "호" : "")
    return (
      '<a href="#" class="law-ref" data-ref="law-article" data-law="' +
      lawName +
      '" data-article="' +
      joLabel +
      '">' +
      match +
      "</a>"
    )
  })

  // NOTE: 조례 자체 조문 (제X조)은 링크하지 않음

  return t
}
