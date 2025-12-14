/**
 * HWPX 파일 파서
 *
 * HWPX는 ZIP 압축된 XML 기반 한글 문서 포맷입니다.
 * 구조: ZIP > Contents/section0.xml > hp:p (단락) > hp:t (텍스트)
 */

import JSZip from "jszip"

export interface HwpxParseResult {
  success: boolean
  markdown?: string
  error?: string
  meta?: {
    textNodes: number
    paragraphs: number
    tables: number
  }
}

/**
 * HWPX 파일을 마크다운으로 변환
 */
export async function parseHwpxToMarkdown(
  buffer: ArrayBuffer
): Promise<HwpxParseResult> {
  try {
    // 1. ZIP 압축 해제
    const zip = await JSZip.loadAsync(buffer)

    // 2. section0.xml 찾기
    const sectionFile = zip.file("Contents/section0.xml")
    if (!sectionFile) {
      // 다른 경로 시도
      const altFile = zip.file("Contents/Section0.xml")
      if (!altFile) {
        return {
          success: false,
          error: "section0.xml을 찾을 수 없습니다",
        }
      }
    }

    const xml = await (sectionFile || zip.file("Contents/Section0.xml"))!.async(
      "text"
    )

    // 3. XML 파싱
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, "text/xml")

    // 파싱 에러 체크
    const parseError = doc.querySelector("parsererror")
    if (parseError) {
      return {
        success: false,
        error: `XML 파싱 에러: ${parseError.textContent}`,
      }
    }

    // 4. 문서 구조 파싱 (표와 일반 단락 구분)
    const result = parseDocumentStructure(doc)

    // 5. 마크다운 포맷 변환
    const markdown = formatToMarkdown(result.lines)

    // 메타 정보
    const allTables = doc.getElementsByTagName("hp:tbl")
    const allTextNodes = doc.getElementsByTagName("hp:t")
    const allParagraphs = doc.getElementsByTagName("hp:p")

    return {
      success: true,
      markdown,
      meta: {
        textNodes: allTextNodes.length,
        paragraphs: allParagraphs.length,
        tables: allTables.length,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "알 수 없는 에러",
    }
  }
}

/**
 * 문서 구조 파싱 - 표와 일반 단락을 구분하여 처리
 */
function parseDocumentStructure(doc: Document): { lines: string[] } {
  const lines: string[] = []
  const processedTexts = new Set<string>() // 중복 텍스트 방지

  // 1. 먼저 모든 표 내부의 단락과 텍스트를 수집
  const tablesInDoc = doc.getElementsByTagName("hp:tbl")
  const paragraphsInTables = new Set<Element>()
  const tableTextsNormalized = new Set<string>() // 정규화된 텍스트 (공백 제거)

  for (let t = 0; t < tablesInDoc.length; t++) {
    const tbl = tablesInDoc[t]
    const parasInTbl = tbl.getElementsByTagName("hp:p")
    for (let p = 0; p < parasInTbl.length; p++) {
      paragraphsInTables.add(parasInTbl[p])
      const text = extractParagraphText(parasInTbl[p])
      if (text) {
        // 공백 완전 제거한 버전도 저장 (중복 감지용)
        tableTextsNormalized.add(text.replace(/\s/g, ""))
      }
    }

    // 셀 전체 텍스트도 수집 (여러 단락이 합쳐진 경우)
    const cellsInTbl = tbl.getElementsByTagName("hp:tc")
    for (let c = 0; c < cellsInTbl.length; c++) {
      const cellText = extractCellText(cellsInTbl[c])
      if (cellText) {
        tableTextsNormalized.add(cellText.replace(/\s/g, "").replace(/<br>/g, ""))
      }
    }
  }

  // 2. 문서 순서대로 처리 (TreeWalker 사용)
  const walker = doc.createTreeWalker(
    doc.documentElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const el = node as Element
        if (el.tagName === "hp:p" || el.tagName === "hp:tbl") {
          return NodeFilter.FILTER_ACCEPT
        }
        return NodeFilter.FILTER_SKIP
      }
    }
  )

  let node: Node | null
  while ((node = walker.nextNode())) {
    const el = node as Element

    if (el.tagName === "hp:tbl") {
      // 표 처리
      const tableMarkdown = parseTable(el)
      if (tableMarkdown) {
        lines.push(tableMarkdown)
      }
    } else if (el.tagName === "hp:p" && !paragraphsInTables.has(el)) {
      // 표 외부의 단락만 처리
      const text = extractParagraphText(el)
      if (!text) continue

      // 정규화된 텍스트로 중복 체크
      const normalized = text.replace(/\s/g, "")
      if (tableTextsNormalized.has(normalized)) continue
      if (processedTexts.has(normalized)) continue

      processedTexts.add(normalized)
      lines.push(text)
    }
  }

  return { lines }
}

/**
 * 단락에서 텍스트 추출
 */
function extractParagraphText(para: Element): string {
  const textNodes = para.getElementsByTagName("hp:t")
  let text = ""

  for (let i = 0; i < textNodes.length; i++) {
    text += textNodes[i].textContent || ""
  }

  // 연속 공백을 단일 공백으로 정규화
  return text.replace(/\s+/g, " ").trim()
}

/**
 * 표를 마크다운 테이블로 변환
 */
function parseTable(tbl: Element): string {
  const rows = tbl.getElementsByTagName("hp:tr")
  if (rows.length === 0) return ""

  const tableData: string[][] = []

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const cells = row.getElementsByTagName("hp:tc")
    const rowData: string[] = []

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      const cellText = extractCellText(cell)
      rowData.push(cellText)
    }

    if (rowData.length > 0) {
      tableData.push(rowData)
    }
  }

  if (tableData.length === 0) return ""

  // 마크다운 테이블 생성
  return createMarkdownTable(tableData)
}

/**
 * 셀에서 텍스트 추출
 */
function extractCellText(cell: Element): string {
  const paragraphs = cell.getElementsByTagName("hp:p")
  const texts: string[] = []

  for (let p = 0; p < paragraphs.length; p++) {
    const text = extractParagraphText(paragraphs[p])
    if (text) {
      texts.push(text)
    }
  }

  // 셀 내 여러 단락은 <br>로 연결
  return texts.join("<br>")
}

/**
 * 마크다운 테이블 문자열 생성
 */
function createMarkdownTable(data: string[][]): string {
  if (data.length === 0) return ""

  // 열 개수 정규화 (최대 열 수에 맞춤)
  const maxCols = Math.max(...data.map(row => row.length))
  const normalizedData = data.map(row => {
    while (row.length < maxCols) {
      row.push("")
    }
    return row
  })

  // 1행 1열 표는 구조화된 텍스트로 변환 (테두리용 표인 경우가 많음)
  if (normalizedData.length === 1 && maxCols === 1) {
    const cellContent = normalizedData[0][0]
    const formattedLines: string[] = []

    cellContent.split(/<br>/i).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      // 숫자. 패턴 (1. 2. 3.)은 굵게
      if (/^\d+\.\s/.test(trimmed)) {
        formattedLines.push(`<div class="hwpx-num-item"><strong>${trimmed}</strong></div>`)
        return
      }
      // 가. 나. 다. 패턴은 hanging indent 스타일
      if (/^[가-힣]\.\s/.test(trimmed)) {
        formattedLines.push(`<div class="hwpx-sub-item">${trimmed}</div>`)
        return
      }
      // "선 서" 등 짧은 제목 패턴 (공백 포함된 한글) → 공백 제거 + 굵게
      if (/^[가-힣\s]{2,10}$/.test(trimmed) && /[가-힣]\s+[가-힣]/.test(trimmed)) {
        const cleanLine = trimmed.replace(/\s+/g, "")
        formattedLines.push("")
        formattedLines.push(`**${cleanLine}**`)
        return
      }
      // 일반 텍스트
      formattedLines.push(trimmed)
    })
    return formattedLines.join("\n")
  }

  const lines: string[] = []

  // 헤더 (첫 번째 행)
  const header = normalizedData[0]
  lines.push("| " + header.join(" | ") + " |")

  // 구분선
  lines.push("| " + header.map(() => "---").join(" | ") + " |")

  // 데이터 행
  for (let i = 1; i < normalizedData.length; i++) {
    lines.push("| " + normalizedData[i].join(" | ") + " |")
  }

  return lines.join("\n")
}

/**
 * 추출된 텍스트 라인을 마크다운으로 포맷
 */
function formatToMarkdown(lines: string[]): string {
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const block = lines[i]

    // 여러 줄이 포함된 블록(테이블에서 온 경우)은 그대로 추가
    if (block.includes("\n")) {
      result.push(block)
      continue
    }

    const line = block

    // [별표 N] 패턴 → 다음 줄(제N조 관련)과 합쳐서 ## 제목으로
    if (/^\[별표\s*\d+/.test(line)) {
      const nextLine = lines[i + 1]
      // 다음 줄이 (제N조 관련) 형태거나 제목이면 합치기
      if (nextLine && (/관련\)?$/.test(nextLine) || /^[가-힣\s]+\([^)]+관련\)$/.test(nextLine))) {
        // 제목 부분과 (관련) 부분 분리
        const match = nextLine.match(/^(.+?)(\([^)]+관련\))$/)
        let cleanNextLine: string
        if (match) {
          // "선 서 문(제2조제2항 관련)" → "선서문 (제2조제2항 관련)"
          const title = match[1].replace(/\s+/g, "")
          const relation = match[2]
          cleanNextLine = `${title} ${relation}`
        } else {
          cleanNextLine = nextLine.replace(/\s+/g, "")
        }
        result.push("")
        result.push(`## ${line} — ${cleanNextLine}`)
        result.push("")
        i++ // 다음 줄 스킵
      } else {
        result.push("")
        result.push(`## ${line}`)
        result.push("")
      }
      continue
    }

    // (제N조 관련) 단독 - 이미 위에서 처리됐으면 스킵됨
    if (/^\([^)]*조[^)]*관련\)$/.test(line)) {
      result.push(`*${line}*`)
      result.push("")
      continue
    }

    // "선 서" 등 짧은 제목 패턴 (공백 포함된 한글) → 공백 제거 + 굵게
    if (/^[가-힣\s]{2,10}$/.test(line) && /[가-힣]\s+[가-힣]/.test(line)) {
      const cleanLine = line.replace(/\s+/g, "")
      result.push("")
      result.push(`**${cleanLine}**`)
      continue
    }

    // 숫자. 로 시작하는 항목 (1. 2. 3.)
    if (/^\d+\.\s/.test(line)) {
      result.push("")
      result.push(`### ${line}`)
      continue
    }

    // 가. 나. 다. 등의 항목
    if (/^[가-힣]\.\s/.test(line)) {
      result.push(`- ${line}`)
      continue
    }

    // 일반 텍스트
    result.push(line)
  }

  return result.join("\n").trim()
}

/**
 * HWPX 파일인지 확인 (매직 바이트 체크)
 */
export function isHwpxFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4))
  // ZIP 시그니처: PK.. (0x50 0x4B 0x03 0x04)
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * 구 HWP 파일인지 확인 (OLE2 포맷)
 */
export function isOldHwpFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4))
  // OLE2 시그니처: 0xD0 0xCF 0x11 0xE0
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}
