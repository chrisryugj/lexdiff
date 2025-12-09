import type { LawArticle, LawParagraph, LawItem, LawMeta } from "./law-types"
import { debugLogger } from "./debug-logger"
import { buildJO } from "./law-parser"
import { linkifyRefsB } from "./unified-link-generator"

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

  match = normalized.match(/제\s*\d+\s*조(?:의\d+)?[^(（]*[（(]\s*([^)）]+?)\s*[）)]/)
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

export function extractArticleText(article: LawArticle, isOrdinance = false, currentLawName?: string): string {
  let text = ""

  // CRITICAL FIX: article.content가 없어도 title이 있으면 표시
  if (article.content || article.title) {
    let content = ""

    if (article.content) {
      // 조문 제목 패턴 매치 - 제X조(제목) 형식 제거 (escape 전에)
      // CRITICAL: 괄호가 있는 경우만 제목으로 인식 (본문의 "제X조" 참조가 잘려나가는 버그 방지)
      // 예: "제28조(과태료)" → 제목으로 인식
      // 예: "제20조와 제23조" → 제목 아님 (본문 시작)
      const titleMatch = article.content.match(/^(제\d+조(?:의\d+)?\s*\([^)]+\))\s*([\s\S]*)$/)

      let rawContent = article.content
      if (titleMatch) {
        const titlePart = titleMatch[1]  // 제X조(제목)
        const bodyPart = titleMatch[2]   // 나머지 본문

        // 제목 제거 - 본문만 사용 (헤더에 이미 표시됨)
        if (bodyPart && bodyPart.trim()) {
          rawContent = bodyPart.trim()
        } else {
          rawContent = ''  // 본문 없음 (호만 있는 경우)
        }
      }

      // 1. 링크 생성 (escape 전에)
      content = linkifyRefsB(rawContent, currentLawName)

      // 2. HTML escape (링크 태그만 보존, <개정> 같은 것은 escape)
      content = content.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
        if (linkTag) return linkTag  // <a> 태그만 보존
        if (otherTag) return escapeHtml(otherTag)  // <개정> 같은 것은 escape
        if (text) return escapeHtml(text)  // 일반 텍스트도 escape
        return match
      })

      // 3. 개정 마커 스타일링
      content = applyRevisionStyling(content)
    } else if (article.title) {
      // article.content가 없고 title만 있는 경우
      const joDisplay = article.joNum || ('제' + article.jo + '조')
      content = '<strong>' + joDisplay
      if (article.title) {
        content += '(' + escapeHtml(article.title) + ')'
      }
      content += '</strong>'
    }

    // Replace 2+ newlines before paragraph markers (원형번호) with single newline
    content = content.replace(/\n{2,}\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g, '\n$1')

    // Replace 2+ newlines before numbered items (호 번호: "1. ", "2. ") with single newline
    content = content.replace(/\n{2,}\s*(\d+\.)/g, '\n$1')

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

    // CRITICAL: 본문 끝 <br> 제거 (호가 있을 경우 이중 줄바꿈 방지)
    content = content.replace(/<br>\s*$/, '')

    text += content
  }

  if (article.paragraphs && article.paragraphs.length > 0) {
    // 먼저 항내용이 있는지 확인 (모달 로직과 동일하게)
    const hasParaContent = article.paragraphs.some(para => para.content && para.content.trim())

    // 모든 호 수집
    const allItems = article.paragraphs.flatMap(para => para.items || [])

    if (hasParaContent) {
      // 항내용이 있는 경우: 본문과 항 사이 줄바꿈 추가
      if (text) text += "\n"

      article.paragraphs.forEach((para) => {
        const paraContent = para.content || ""
        const paraNum = para.num || ""

        const startsWithNumber = paraContent.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.)/)

        // CORRECT order: linkify → selective escape → styling
        let styledParaContent = linkifyRefsB(paraContent, currentLawName)
        styledParaContent = styledParaContent.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
          if (tag) return tag
          if (text) return escapeHtml(text)
          return match
        })
        styledParaContent = applyRevisionStyling(styledParaContent)

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

            // CORRECT order: linkify → selective escape → styling
            let styledItemContent = linkifyRefsB(itemContent, currentLawName)
            styledItemContent = styledItemContent.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
              if (tag) return tag
              if (text) return escapeHtml(text)
              return match
            })
            styledItemContent = applyRevisionStyling(styledItemContent)

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
    } else if (allItems.length > 0) {
      // 항내용 없고 호만 있는 경우: 본문은 이미 위에서 처리했고, 호만 추가
      // (관세법 제2조 같은 경우 - 호내용에 이미 번호 포함)
      allItems.forEach((item, index) => {
        const itemContent = item.content || ""
        const itemNum = item.num || ""

        const startsWithNumber = itemContent.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.)/)

        // CORRECT order: linkify → selective escape → styling
        let styledItemContent = linkifyRefsB(itemContent, currentLawName)
        styledItemContent = styledItemContent.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
          if (tag) return tag
          if (text) return escapeHtml(text)
          return match
        })
        styledItemContent = applyRevisionStyling(styledItemContent)

        // 첫 번째 호만 <br> 하나로 연결, 나머지는 <br> 추가
        if (index === 0) {
          text += "<br>" + styledItemContent
        } else {
          text += "<br>" + styledItemContent
        }
      })
    }
  }

  return text.trim()
}

/**
 * Format delegation/citation content with the same styling as main articles
 * (For plain text content without structured paragraphs/items)
 */
export function formatDelegationContent(content: string, currentLawName?: string): string {
  if (!content || content.trim().length === 0) {
    return ""
  }

  // CORRECT order: linkify → selective escape → styling
  let text = linkifyRefsB(content, currentLawName)
  text = text.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, txt) => {
    if (tag) return tag
    if (txt) return escapeHtml(txt)
    return match
  })
  text = applyRevisionStyling(text)

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

  // Add line break for sub-items (가., 나., 다.) - only at start of line or after line break
  // This prevents matching sentence endings like "...을 말한다."
  text = text.replace(/(^|<br>|<br\/>|<br \/>)\s*([가-힣]\.)\s+/g, '$1&nbsp;&nbsp;$2 ')

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

/**
 * 개정 태그 키워드를 4가지 타입으로 분류
 * @param keyword - 개정 태그 키워드 (예: "신설", "개정", "삭제" 등)
 * @returns 'new' | 'edit' | 'delete' | 'etc'
 */
function getRevisionType(keyword: string): 'new' | 'edit' | 'delete' | 'etc' {
  if (/신설/.test(keyword)) return 'new'
  if (/삭제/.test(keyword)) return 'delete'
  if (/개정|전문개정|전부개정|제정/.test(keyword)) return 'edit'
  return 'etc'
}

/**
 * 개정 태그에 타입별 스타일 적용
 * - 신설: 녹색 (rev-mark-new)
 * - 개정/전문개정/제정: 파란색 (rev-mark-edit)
 * - 삭제: 빨간색 (rev-mark-delete)
 * - 기타(종전/이동): 회색 (rev-mark-etc)
 */
function applyRevisionStyling(text: string): string {
  let styled = text

  // 1. ＜개정/신설/삭제 날짜＞ 형식 (HTML escaped & 전각 괄호)
  const datePatterns = [
    /&lt;(개정|신설|전문개정|전부개정|제정|삭제)\s+([0-9., ]+)&gt;/g,
    /＜(개정|신설|전문개정|전부개정|제정|삭제)\s+([0-9., ]+)＞/g,
  ]

  for (const pattern of datePatterns) {
    styled = styled.replace(pattern, (match, keyword, date) => {
      const type = getRevisionType(keyword)
      return `<span class="rev-mark rev-mark-${type}">＜${keyword} ${date}＞</span>`
    })
  }

  // 2. "삭제 ＜날짜＞" 형식 (특수 케이스)
  styled = styled.replace(
    /(삭제)\s*&lt;([0-9., ]+)&gt;/g,
    '<span class="rev-mark rev-mark-delete">$1 ＜$2＞</span>',
  )

  styled = styled.replace(
    /(삭제)\s*＜([0-9., ]+)＞/g,
    '<span class="rev-mark rev-mark-delete">$1 ＜$2＞</span>',
  )

  // 3. [본조신설/본조삭제]
  styled = styled.replace(
    /\[(본조신설)[^\]]*\]/g,
    '<span class="rev-mark rev-mark-new">$&</span>',
  )

  styled = styled.replace(
    /\[(본조삭제)[^\]]*\]/g,
    '<span class="rev-mark rev-mark-delete">$&</span>',
  )

  // 4. [종전...], [제X조에서 이동...]
  styled = styled.replace(
    /\[종전[^\]]*\]/g,
    '<span class="rev-mark rev-mark-etc">$&</span>',
  )

  styled = styled.replace(
    /\[제\d+조[^\]]*에서 이동[^\]]*\]/g,
    '<span class="rev-mark rev-mark-etc">$&</span>',
  )

  return styled
}

// 기존 linkifyRefsB 및 linkifyOrdinanceRefs 함수는 통합 시스템(unified-link-generator)으로 대체됨
// import { linkifyRefsB } from "./unified-link-generator"를 사용









