/**
 * HWPX 파일 파서
 *
 * HWPX는 ZIP 압축된 XML 기반 한글 문서 포맷입니다.
 * 구조: ZIP > Contents/section0.xml > hp:p (단락) > hp:t (텍스트)
 */

import JSZip from "jszip"
import { DOMParser as XMLDOMParser } from "xmldom"

// 서버/브라우저 환경 호환 DOMParser
function getDOMParser(): DOMParser | XMLDOMParser {
  if (typeof window !== "undefined" && window.DOMParser) {
    return new window.DOMParser()
  }
  return new XMLDOMParser()
}

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
    const parser = getDOMParser()
    const doc = parser.parseFromString(xml, "text/xml")

    // 파싱 에러 체크 (서버/브라우저 호환)
    if (typeof window === "undefined") {
      // 서버: xmldom은 파싱 에러 시 parsererror 태그를 documentElement로 반환
      if (doc.documentElement?.tagName === "parsererror") {
        return {
          success: false,
          error: `XML 파싱 에러: ${doc.documentElement.textContent}`,
        }
      }
    } else {
      // 브라우저: querySelector 사용
      const parseError = doc.querySelector("parsererror")
      if (parseError) {
        return {
          success: false,
          error: `XML 파싱 에러: ${parseError.textContent}`,
        }
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

  // 1. 먼저 문서에 표가 있는지 확인
  const tablesInDoc = doc.getElementsByTagName("hp:tbl")
  const hasTable = tablesInDoc.length > 0

  // 2. 표가 있는 경우, 표 내부의 모든 단락 수집
  const paragraphsInTables = new Set<Element>()
  const tableTextsNormalized = new Set<string>() // 정규화된 텍스트 (공백 제거)

  // 표 전체의 모든 텍스트를 하나의 문자열로 합치기
  let allTableTextCombined = ""

  for (let t = 0; t < tablesInDoc.length; t++) {
    const tbl = tablesInDoc[t]
    const parasInTbl = tbl.getElementsByTagName("hp:p")
    for (let p = 0; p < parasInTbl.length; p++) {
      paragraphsInTables.add(parasInTbl[p])
      const text = extractParagraphText(parasInTbl[p])
      if (text) {
        // 개별 단락 저장
        tableTextsNormalized.add(text.replace(/\s/g, ""))
        // 전체 텍스트에도 추가
        allTableTextCombined += text.replace(/\s/g, "")
      }
    }

    // 셀 전체 텍스트도 수집
    const cellsInTbl = tbl.getElementsByTagName("hp:tc")
    for (let c = 0; c < cellsInTbl.length; c++) {
      const cellText = extractCellText(cellsInTbl[c])
      if (cellText) {
        const normalized = cellText.replace(/\s/g, "").replace(/<br>/g, "")
        tableTextsNormalized.add(normalized)
        allTableTextCombined += normalized
      }
    }
  }

  // 2. 문서 순서대로 처리 (재귀 순회)
  // TreeWalker 대신 재귀로 순회 (서버 환경 호환)
  function walkNodes(parent: Element | Document) {
    const children = parent.childNodes
    for (let i = 0; i < children.length; i++) {
      const node = children[i]
      if (node.nodeType !== 1) continue // ELEMENT_NODE만 처리

      const el = node as Element

      if (el.tagName === "hp:tbl") {
        // 표 처리
        const tableMarkdown = parseTable(el)
        if (tableMarkdown) {
          lines.push(tableMarkdown)
        }
      } else if (el.tagName === "hp:p" && !paragraphsInTables.has(el)) {
        // 표 외부의 단락 처리
        const text = extractParagraphText(el)

        if (text) {
          const normalized = text.replace(/\s/g, "")

          // 표가 있는 문서라면, 표 내용과 중복되는 텍스트는 무시
          if (hasTable) {
            // 1. 개별 단락으로 중복 체크
            if (tableTextsNormalized.has(normalized)) {
              // 중복이어도 자식 노드는 탐색
              walkNodes(el)
              continue
            }
            // 2. 전체 표 텍스트에 포함되어 있는지 체크 (긴 문자열 대응)
            if (allTableTextCombined.includes(normalized)) {
              // 중복이어도 자식 노드는 탐색
              walkNodes(el)
              continue
            }
          }

          if (!processedTexts.has(normalized)) {
            processedTexts.add(normalized)
            lines.push(text)
          }
        }

        // hp:p 안에 hp:tbl이 있을 수 있으므로 항상 자식 노드 재귀 탐색
        walkNodes(el)
      } else {
        // hp:p도 hp:tbl도 아닌 경우, 자식 노드 재귀 탐색
        walkNodes(el)
      }
    }
  }

  // 재귀 순회 시작
  walkNodes(doc.documentElement)

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

  // 첫 번째 열만 병합 셀 처리: 동일한 값이 연속되면 빈 셀로 변경
  const processedData = data.map((row, rowIndex) => {
    // 배열 복사 (원본 보호)
    const newRow = [...row]

    if (rowIndex === 0) return newRow // 헤더는 그대로

    // 첫 번째 열만 이전 행과 비교하여 중복 제거 (병합 셀 표현)
    if (rowIndex > 0) {
      const prevRow = data[rowIndex - 1]
      // 첫 번째 열만 체크
      if (prevRow && prevRow[0] && newRow[0] === prevRow[0] && newRow[0].trim()) {
        newRow[0] = "" // 병합된 셀로 표시
      }
    }
    return newRow
  })

  const normalizedData = processedData.map((row, rowIndex) => {
    // 헤더 행(첫 번째 행)은 뒤에 빈 셀 추가
    if (rowIndex === 0) {
      const newRow = [...row]
      while (newRow.length < maxCols) {
        newRow.push("")
      }
      return newRow
    }

    // 데이터 행: 열이 부족하면 앞에 빈 셀 추가 (병합 셀 처리)
    const deficit = maxCols - row.length
    if (deficit > 0) {
      // 필요한 개수만큼 빈 셀을 앞에 추가
      const emptyCells = new Array(deficit).fill("")
      return [...emptyCells, ...row]
    }

    return [...row]
  })

  // 중복 행 제거 (내용이 완전히 동일한 행)
  const uniqueData: string[][] = []
  const seenRows = new Set<string>()

  for (const row of normalizedData) {
    const rowKey = row.join("||") // 구분자로 연결
    if (!seenRows.has(rowKey)) {
      seenRows.add(rowKey)
      uniqueData.push(row)
    }
  }

  // 중복 제거 후 데이터가 없으면 반환
  if (uniqueData.length === 0) return ""

  // 1행 1열 표는 구조화된 텍스트로 변환 (테두리용 표인 경우가 많음)
  if (uniqueData.length === 1 && maxCols === 1) {
    const cellContent = uniqueData[0][0]
    const htmlLines: string[] = []
    let prevWasNumbered = false // 이전 줄이 숫자. 패턴이었는지
    let currentSection: string[] = [] // 현재 섹션 내용 (큰 제목 아래)

    const flushSection = () => {
      if (currentSection.length > 0) {
        htmlLines.push(`<div class="hwpx-section">\n${currentSection.join("\n")}\n</div>`)
        currentSection = []
      }
    }

    cellContent.split(/<br>/i).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      const isNumbered = /^\d+\.\s/.test(trimmed)
      const isSubItem = /^[가-힣]\.\s/.test(trimmed)
      // 번호 없는 제목: 짧은 한글 (띄어쓰기 포함, 10글자 이하, 숫자/특수문자 없음)
      const isPlainTitle = /^[가-힣\s]{2,10}$/.test(trimmed) && trimmed.replace(/\s/g, '').length <= 5

      // 숫자. 패턴: 큰 제목
      if (isNumbered) {
        flushSection() // 이전 섹션 마무리
        if (prevWasNumbered) {
          htmlLines.push("") // 숫자 항목 간 한 줄 띄우기
        }
        htmlLines.push(`<div class="hwpx-num-item"><strong>${trimmed}</strong></div>`)
        prevWasNumbered = true
        return
      }

      // 번호 없는 제목: 굵게 표시하고 섹션 시작
      if (isPlainTitle) {
        flushSection() // 이전 섹션 마무리
        htmlLines.push(`<div class="hwpx-num-item"><strong>${trimmed}</strong></div>`)
        prevWasNumbered = false
        return
      }

      // 가. 나. 다. 패턴 또는 일반 텍스트: 현재 섹션에 추가
      if (isSubItem) {
        currentSection.push(`<div class="hwpx-sub-item">${trimmed}</div>`)
      } else {
        currentSection.push(`<div class="hwpx-content">${trimmed}</div>`)
      }
      prevWasNumbered = false
    })

    flushSection() // 마지막 섹션 마무리
    return htmlLines.join("\n")
  }

  const lines: string[] = []

  // 헤더 (첫 번째 행)
  const header = uniqueData[0]
  lines.push("| " + header.join(" | ") + " |")

  // 구분선
  lines.push("| " + header.map(() => "---").join(" | ") + " |")

  // 데이터 행 (빈 셀은 그대로 빈 셀로 표시)
  for (let i = 1; i < uniqueData.length; i++) {
    lines.push("| " + uniqueData[i].join(" | ") + " |")
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

      // 이전 줄이 별표였다면 2줄 띄우기
      if (result.length > 0 && /^##\s*\[별표\s*\d+/.test(result[result.length - 1])) {
        result.push("")
        result.push("")
      }

      // 다음 줄이 (제N조 관련) 형태거나 제목이면 합치기
      if (nextLine && (/관련\)?$/.test(nextLine) || /^[가-힣\s]+\([^)]+관련\)$/.test(nextLine))) {
        result.push("")
        result.push(`## ${line} ${nextLine}`)
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

    // 일반 텍스트 (표 외부 단락들은 그냥 추가)
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
