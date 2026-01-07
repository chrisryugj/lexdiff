import type { LawArticle, LawParagraph, LawItem, LawMeta } from "./law-types"
import { debugLogger } from "./debug-logger"
import { buildJO } from "./law-parser"
import { linkifyRefsB } from "./unified-link-generator"

type BoxTableReplacement = { token: string; html: string }

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function renderInlineLawText(text: string, currentLawName?: string): string {
  // CORRECT order: remove img tags → linkify → selective escape → styling
  let rendered = removeImgTags(text)
  rendered = linkifyRefsB(rendered, currentLawName)
  rendered = rendered.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, plainText) => {
    if (linkTag) return linkTag
    if (otherTag) return escapeHtml(otherTag)
    if (plainText) return escapeHtml(plainText)
    return match
  })
  rendered = applyRevisionStyling(rendered)
  return rendered
}

/**
 * 법령 본문의 <img> 태그 제거
 * 법제처 API 응답에 포함된 이미지 참조를 숨김 처리
 */
function removeImgTags(text: string): string {
  // <img src="..." alt="..." > 형태의 태그 제거
  return text.replace(/<img\s[^>]*>/gi, '')
}

function splitBoxTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  const isVertical = (ch: string) => ch === "│" || ch === "┃" || ch === "|"
  if (trimmed.length < 2) return null
  if (!isVertical(trimmed[0]) || !isVertical(trimmed[trimmed.length - 1])) return null

  const inner = trimmed.slice(1, -1)
  const parts = inner.split(/[│┃|]/g)
  // 최소 1개 셀 필요 (단일 컬럼 박스 포함)
  if (parts.length < 1) return null

  return parts.map((p) =>
    p
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
}

function parseBoxDrawingTableBlock(blockLines: string[], currentLawName?: string): string | null {
  const rows: Array<{ lineIndex: number; cells: string[] }> = []
  for (let i = 0; i < blockLines.length; i++) {
    const cells = splitBoxTableRow(blockLines[i])
    if (cells) rows.push({ lineIndex: i, cells })
  }

  if (rows.length === 0) return null
  const columnCount = Math.max(...rows.map((r) => r.cells.length))

  // 단일 컬럼 박스: 수식/공식 박스로 렌더링
  if (columnCount === 1) {
    // 각 행을 개별 처리 후 <br>로 연결
    const styledRows = rows
      .map(({ cells }) => cells[0])
      .filter(Boolean)
      .map(cellContent => renderInlineLawText(cellContent, currentLawName))
    if (styledRows.length === 0) return null
    const styledContent = styledRows.join('<br>')
    return (
      `<div class="my-3 p-3 border border-border rounded-md bg-muted/20 whitespace-normal">` +
      `<div class="text-center leading-relaxed">${styledContent}</div>` +
      `</div>`
    )
  }

  const firstSeparatorIndex = blockLines.findIndex((line) => {
    const t = line.trim()
    return (
      (t.startsWith("├") || t.startsWith("┣") || t.startsWith("╞") || t.startsWith("╟")) &&
      (t.includes("┼") || t.includes("╪") || t.includes("╫"))
    )
  })

  const headerRows = firstSeparatorIndex >= 0 ? rows.filter((r) => r.lineIndex < firstSeparatorIndex) : rows.slice(0, 1)
  const bodyRows = firstSeparatorIndex >= 0 ? rows.filter((r) => r.lineIndex > firstSeparatorIndex) : rows.slice(1)

  const padCells = (cells: string[]) => {
    if (cells.length === columnCount) return cells
    const padded = cells.slice()
    while (padded.length < columnCount) padded.push("")
    return padded
  }

  const thead =
    headerRows.length > 0
      ? `<thead>${headerRows
          .map(({ cells }) => {
            const safeCells = padCells(cells).map((c) => renderInlineLawText(c, currentLawName))
            return `<tr>${safeCells
              .map(
                (c) =>
                  `<th class="border border-border bg-muted/40 px-2 py-1 text-left font-semibold align-top">${c || "&nbsp;"}</th>`,
              )
              .join("")}</tr>`
          })
          .join("")}</thead>`
      : ""

  const tbody = `<tbody>${bodyRows
    .map(({ cells }) => {
      const safeCells = padCells(cells).map((c) => renderInlineLawText(c, currentLawName))
      return `<tr>${safeCells
        .map((c) => `<td class="border border-border px-2 py-1 align-top">${c || "&nbsp;"}</td>`)
        .join("")}</tr>`
    })
    .join("")}</tbody>`

  // whitespace-pre-wrap 컨테이너 내부에서 테이블은 일반 whitespace로 렌더링하는 편이 자연스러움
  return (
    `<div class="my-3 overflow-x-auto whitespace-normal">` +
    `<table class="w-full min-w-[320px] border-collapse border border-border text-sm">` +
    thead +
    tbody +
    `</table></div>`
  )
}

function replaceBoxTablesWithTokens(rawText: string, currentLawName?: string): { text: string; replacements: BoxTableReplacement[] } {
  const lines = rawText.split("\n")
  const out: string[] = []
  const replacements: BoxTableReplacement[] = []

  let tableIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    const isTopBorder = t.startsWith("┌") || t.startsWith("┏")
    if (!isTopBorder) {
      out.push(line)
      continue
    }

    // Find the matching bottom border line.
    let end = -1
    for (let j = i + 1; j < lines.length; j++) {
      const tj = lines[j].trim()
      if (tj.startsWith("└") || tj.startsWith("┗")) {
        end = j
        break
      }
    }

    if (end === -1) {
      out.push(line)
      continue
    }

    const block = lines.slice(i, end + 1)
    const tableHtml = parseBoxDrawingTableBlock(block, currentLawName)
    if (!tableHtml) {
      out.push(line)
      continue
    }

    const token = `__LEXDIFF_BOX_TABLE_${tableIndex}__`
    tableIndex++
    replacements.push({ token, html: tableHtml })
    out.push(token)
    i = end
  }

  return { text: out.join("\n"), replacements }
}

function applyBoxTableReplacements(html: string, replacements: BoxTableReplacement[]): string {
  let out = html
  for (const { token, html: tableHtml } of replacements) {
    out = out.replace(new RegExp(escapeRegExp(token), "g"), tableHtml)
  }
  return out
}

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

  // ✅ "이동" 타입 추가
  const halfWidthPattern = /<(개정|신설|전문개정|제정|삭제|이동)\s+([0-9., ]+)>/g
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

  const fullWidthPattern = /＜(개정|신설|전문개정|제정|삭제|이동)\s+([0-9., ]+)＞/g

  while ((match = fullWidthPattern.exec(content)) !== null) {
    const dateStr = match[2].replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, "").trim()
    if (dateStr.length === 8) {
      revisions.push({
        type: match[1],
        date: dateStr,
      })
    }
  }

  const squareBracketPattern = /\[(개정|신설|전문개정|제정|삭제|이동)\s+([0-9., ]+)\]/g

  while ((match = squareBracketPattern.exec(content)) !== null) {
    const dateStr = match[2].replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, "").trim()
    if (dateStr.length === 8) {
      revisions.push({
        type: match[1],
        date: dateStr,
      })
    }
  }

  // ✅ 이동 형식 (복합 패턴 지원):
  // - "[제22조에서 이동 <2023.6.16.>]"
  // - "[제25조에서 이동, 종전 제21조는 제17조로 이동 <2023.6.16.>]"
  // 대괄호 안에 "이동"이 있고 꺽쇠 안에 날짜가 있으면 모두 매칭
  const movePattern = /\[[^\]]*이동[^\]]*<([0-9., ]+)>\]/g

  while ((match = movePattern.exec(content)) !== null) {
    const dateStr = match[1].replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, "").trim()
    if (dateStr.length === 8) {
      revisions.push({
        type: '이동',
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

      const hangRevPattern = /<(개정|신설|전문개정|제정|삭제|이동)\s+([0-9., ]+)>/g
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
  const boxTableReplacements: BoxTableReplacement[] = []

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

      // <img> 태그 제거 (법제처 API 응답에 포함된 이미지 참조)
      rawContent = removeImgTags(rawContent)

      // 박스(유니코드) 표를 HTML 테이블로 렌더링하기 위해 먼저 토큰으로 치환
      // (escape 단계에서 <table> 같은 태그는 모두 escape 되므로 마지막에 토큰을 HTML로 교체한다)
      {
        const boxed = replaceBoxTablesWithTokens(rawContent, currentLawName)
        rawContent = boxed.text
        boxTableReplacements.push(...boxed.replacements)
      }

      // 0. 항 번호(①②③) 바로 뒤 공백 정규화: 모든 공백/줄바꿈 제거 후 공백 1칸 추가
      rawContent = rawContent.replace(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])[\s\r\n\t\u00A0]*/g, '$1 ')

      // 1. 링크 생성 (escape 전에)
      // ⚠️ 이미 링크가 적용된 콘텐츠(판례 전문 등)는 스킵
      if (rawContent.includes('<a ') || rawContent.includes('data-ref=')) {
        content = rawContent
      } else {
        content = linkifyRefsB(rawContent, currentLawName)
      }

      // 2. HTML escape (링크 태그만 보존, <개정> 같은 것은 escape)
      content = content.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
        if (linkTag) return linkTag  // <a> 태그만 보존
        if (otherTag) return escapeHtml(otherTag)  // <개정> 같은 것은 escape
        if (text) return escapeHtml(text)  // 일반 텍스트도 escape
        return match
      })

      // 3. 개정 마커 스타일링
      content = applyRevisionStyling(content)
    } else if (article.title && !(article.paragraphs && article.paragraphs.length > 0)) {
      // article.content가 없고 title만 있고, paragraphs도 없는 경우에만 제목 표시
      // (paragraphs가 있으면 모달 헤더에 이미 제목이 표시되므로 본문에는 출력하지 않음)
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
      // 항내용이 있는 경우
      article.paragraphs.forEach((para, paraIndex) => {
        let paraContent = para.content || ""
        const paraNum = para.num || ""

        // <img> 태그 제거
        paraContent = removeImgTags(paraContent)

        {
          const boxed = replaceBoxTablesWithTokens(paraContent, currentLawName)
          paraContent = boxed.text
          boxTableReplacements.push(...boxed.replacements)
        }

        // 항 번호(①②③) 바로 뒤 공백 정규화: 모든 공백/줄바꿈 제거 후 공백 1칸 추가
        paraContent = paraContent.replace(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])[\s\r\n\t\u00A0]*/g, '$1 ')

        const startsWithNumber = paraContent.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.)/)

        // CORRECT order: linkify → selective escape → styling
        let styledParaContent = linkifyRefsB(paraContent, currentLawName)

        // 항 번호 뒤에 생긴 <br> 태그도 제거 후 공백 1칸 추가
        styledParaContent = styledParaContent.replace(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])(?:<br\s*\/?>|\s)*/gi, '$1 ')

        styledParaContent = styledParaContent.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
          if (linkTag) return linkTag  // <a> 태그만 보존
          if (otherTag) return escapeHtml(otherTag)  // <개정> 같은 것은 escape
          if (text) return escapeHtml(text)
          return match
        })
        styledParaContent = applyRevisionStyling(styledParaContent)

        if (startsWithNumber) {
          // 첫 번째 항은 본문 바로 다음에 이어지고, 이후 항은 줄바꿈 후 표시
          if (paraIndex === 0 && text) {
            text += "<br>" + styledParaContent
          } else if (paraIndex === 0) {
            text += styledParaContent
          } else {
            text += "<br>" + styledParaContent
          }
        } else if (paraNum) {
          text += "\n" + paraNum + ". " + styledParaContent
        } else {
          text += "\n" + styledParaContent
        }

        if (para.items) {
          para.items.forEach((item) => {
            let itemContent = item.content || ""
            const itemNum = item.num || ""

            // <img> 태그 제거
            itemContent = removeImgTags(itemContent)

            {
              const boxed = replaceBoxTablesWithTokens(itemContent, currentLawName)
              itemContent = boxed.text
              boxTableReplacements.push(...boxed.replacements)
            }

            const startsWithNumber = itemContent.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.)/)

            // CORRECT order: linkify → selective escape → styling
            let styledItemContent = linkifyRefsB(itemContent, currentLawName)
            styledItemContent = styledItemContent.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
              if (linkTag) return linkTag  // <a> 태그만 보존
              if (otherTag) return escapeHtml(otherTag)  // <개정> 같은 것은 escape
              if (text) return escapeHtml(text)
              return match
            })
            styledItemContent = applyRevisionStyling(styledItemContent)

            if (startsWithNumber) {
              text += "<br>" + styledItemContent
            } else if (itemNum) {
              text += "<br>" + itemNum + ". " + styledItemContent
            } else {
              text += "<br>" + styledItemContent
            }
          })
        }
      })
    } else if (allItems.length > 0) {
      // 항내용 없고 호만 있는 경우: 본문은 이미 위에서 처리했고, 호만 추가
      // (관세법 제2조 같은 경우 - 호내용에 이미 번호 포함)
      allItems.forEach((item, index) => {
        let itemContent = item.content || ""
        const itemNum = item.num || ""

        // <img> 태그 제거
        itemContent = removeImgTags(itemContent)

        {
          const boxed = replaceBoxTablesWithTokens(itemContent, currentLawName)
          itemContent = boxed.text
          boxTableReplacements.push(...boxed.replacements)
        }

        const startsWithNumber = itemContent.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.)/)

        // CORRECT order: linkify → selective escape → styling
        let styledItemContent = linkifyRefsB(itemContent, currentLawName)
        styledItemContent = styledItemContent.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
          if (linkTag) return linkTag  // <a> 태그만 보존
          if (otherTag) return escapeHtml(otherTag)  // <개정> 같은 것은 escape
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

  text = applyBoxTableReplacements(text, boxTableReplacements)
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

  // <img> 태그 제거
  content = removeImgTags(content)

  const boxTableReplacements: BoxTableReplacement[] = []
  {
    const boxed = replaceBoxTablesWithTokens(content, currentLawName)
    content = boxed.text
    boxTableReplacements.push(...boxed.replacements)
  }

  // CORRECT order: linkify → selective escape → styling
  let text = linkifyRefsB(content, currentLawName)
  text = text.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, txt) => {
    if (linkTag) return linkTag  // <a> 태그만 보존
    if (otherTag) return escapeHtml(otherTag)  // <개정> 같은 것은 escape
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

  text = applyBoxTableReplacements(text, boxTableReplacements)
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
 * - 기타(종전): 회색 (rev-mark-etc)
 * - 이동: 주황색 (rev-mark-move)
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

  // 4. [종전...], [제X조에서/로 이동...]
  styled = styled.replace(
    /\[종전[^\]]*\]/g,
    '<span class="rev-mark rev-mark-etc">$&</span>',
  )

  // 이동 태그: HTML escaped 버전 처리 및 전각 괄호로 통일
  // "[제21조에서 이동 &lt;2023.6.16.&gt;]", "[제3호에서 이동 &lt;2023.6.16.&gt; ]" 등
  // 날짜 뒤 공백 허용
  styled = styled.replace(
    /\[([^\]]*(?:에서|로)\s*이동[^\]]*?)&lt;([0-9., ]+)&gt;\s*\]/g,
    '<span class="rev-mark rev-mark-move">＜$1$2＞</span>',
  )

  // 이동 태그: 원본 꺽쇠 버전 (escape 안 된 경우)
  styled = styled.replace(
    /\[([^\]]*(?:에서|로)\s*이동[^\]]*?)<([0-9., ]+)>\s*\]/g,
    '<span class="rev-mark rev-mark-move">＜$1$2＞</span>',
  )

  // 이동 태그: 전각 괄호 버전 (대괄호 없이 직접 전각 괄호로 들어온 경우)
  // "＜제21조에서 이동 2023.6.16.＞" 형식
  // (?<!>) - 이미 스타일 적용된 경우(>＜) 제외하여 중첩 방지
  styled = styled.replace(
    /(?<!>)＜([^＞]*(?:에서|로)\s*이동[^＞]*?)([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\.?)＞/g,
    '<span class="rev-mark rev-mark-move">＜$1$2＞</span>',
  )

  // 이동 태그: HTML escaped 버전 (대괄호 없이)
  // "&lt;제21조에서 이동 2023.6.16.&gt;" 형식
  styled = styled.replace(
    /(?<!>)&lt;([^&]*(?:에서|로)\s*이동[^&]*?)([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\.?)&gt;/g,
    '<span class="rev-mark rev-mark-move">＜$1$2＞</span>',
  )

  return styled
}

// 기존 linkifyRefsB 및 linkifyOrdinanceRefs 함수는 통합 시스템(unified-link-generator)으로 대체됨
// import { linkifyRefsB } from "./unified-link-generator"를 사용

