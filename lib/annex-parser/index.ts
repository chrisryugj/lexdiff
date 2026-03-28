/**
 * 별표 파일 통합 파서 — kordoc + Vercel 호환 PDF 처리
 *
 * - HWPX/HWP5: kordoc 라이브러리 (순수 파싱)
 * - PDF: pdfjs-dist 직접 호출 (Vercel 서버리스에서 kordoc의
 *   createRequire(import.meta.url) + DOMMatrix가 미지원이므로)
 *
 * @see https://github.com/chrisryugj/kordoc
 */

import { parseHwpx, parseHwp, isHwpxFile, isOldHwpFile, isPdfFile } from "kordoc"
import type { ParseResult } from "kordoc"

// ─── 타입 re-export ─────────────────────────────────

export type AnnexParseResult = ParseResult

export { isHwpxFile, isOldHwpFile, isPdfFile }

// ─── PDF 파서 (Vercel 호환) ─────────────────────────

async function parsePdfDirect(buffer: ArrayBuffer): Promise<ParseResult> {
  try {
    // Vercel 서버리스(Node.js)에서 DOMMatrix가 없으므로 polyfill
    if (typeof globalThis.DOMMatrix === "undefined") {
      // pdfjs-dist가 DOMMatrix를 참조하지만 텍스트 추출에는 불필요
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).DOMMatrix = class DOMMatrix {
        m: number[] = [1, 0, 0, 1, 0, 0]
        constructor(init?: number[]) { if (init) this.m = init }
      }
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    // Vercel 서버리스: worker 비활성화 (fake worker 사용)
    pdfjs.GlobalWorkerOptions.workerSrc = "data:,"
    const { getDocument } = pdfjs

    const data = new Uint8Array(buffer)
    const doc = await getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise

    const pageCount = doc.numPages
    if (pageCount === 0) {
      return { success: false, fileType: "pdf", pageCount: 0, error: "PDF에 페이지가 없습니다." }
    }

    const pageTexts: string[] = []
    let totalChars = 0

    for (let i = 1; i <= Math.min(pageCount, 5000); i++) {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()

      const lines = groupTextItemsByLine(textContent.items)
      const pageText = lines.join("\n")
      totalChars += pageText.replace(/\s/g, "").length
      pageTexts.push(pageText)
    }

    // 이미지 기반 PDF 감지
    const avgCharsPerPage = totalChars / pageCount
    if (avgCharsPerPage < 10) {
      return {
        success: false,
        fileType: "pdf",
        isImageBased: true,
        pageCount,
        error: `이미지 기반 PDF (${pageCount}페이지, 텍스트 ${totalChars}자)`,
      }
    }

    let markdown = ""
    for (let i = 0; i < pageTexts.length; i++) {
      const cleaned = cleanPdfText(pageTexts[i])
      if (cleaned.trim()) {
        if (i > 0 && markdown) markdown += "\n\n"
        markdown += cleaned
      }
    }

    markdown = reconstructTables(markdown)

    return { success: true, fileType: "pdf", markdown, pageCount }
  } catch (err) {
    return {
      success: false,
      fileType: "pdf",
      pageCount: 0,
      error: err instanceof Error ? err.message : "PDF 파싱 실패",
    }
  }
}

// ─── 메인 엔트리 ─────────────────────────────────────

export async function parseAnnexFile(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  if (isHwpxFile(buffer)) return parseHwpx(buffer)
  if (isOldHwpFile(buffer)) return parseHwp(buffer)
  if (isPdfFile(buffer)) return parsePdfDirect(buffer)
  return { success: false, fileType: "unknown", error: "지원하지 않는 파일 형식입니다." }
}

// ─── PDF 유틸 (kordoc 포팅) ─────────────────────────

interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupTextItemsByLine(items: any[]): string[] {
  const textItems = items.filter((item: TextItem) =>
    typeof item.str === "string" && item.str.trim() !== ""
  ) as TextItem[]
  if (textItems.length === 0) return []

  textItems.sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5]
    if (Math.abs(yDiff) < 2) return a.transform[4] - b.transform[4]
    return yDiff
  })

  const lines: string[] = []
  let currentY = textItems[0].transform[5]
  let currentLine: { text: string; x: number; width: number }[] = []

  for (const item of textItems) {
    const y = item.transform[5]
    if (Math.abs(currentY - y) > Math.max(item.height * 0.5, 2)) {
      if (currentLine.length > 0) lines.push(mergeLineItems(currentLine))
      currentLine = []
      currentY = y
    }
    currentLine.push({ text: item.str, x: item.transform[4], width: item.width })
  }
  if (currentLine.length > 0) lines.push(mergeLineItems(currentLine))
  return lines
}

function mergeLineItems(items: { text: string; x: number; width: number }[]): string {
  if (items.length <= 1) return items[0]?.text || ""
  items.sort((a, b) => a.x - b.x)
  let result = items[0].text
  for (let i = 1; i < items.length; i++) {
    const gap = items[i].x - (items[i - 1].x + items[i - 1].width)
    if (gap > 15) result += "\t"
    else if (gap > 3) result += " "
    result += items[i].text
  }
  return result
}

function cleanPdfText(text: string): string {
  return text
    .replace(/^[\s]*[-–—]\s*\d+\s*[-–—][\s]*$/gm, "")
    .replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, "")
    .replace(/^(법제처\s*국가법령정보센터)\s*$/gm, "")
    .replace(/([가-힣·,\-])\n([가-힣(])/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function reconstructTables(text: string): string {
  const lines = text.split("\n")
  const result: string[] = []
  let tableBuffer: string[][] = []

  for (const line of lines) {
    if (line.includes("\t")) {
      tableBuffer.push(line.split("\t").map(c => c.trim()))
    } else {
      if (tableBuffer.length >= 2) result.push(formatTable(tableBuffer))
      else if (tableBuffer.length === 1) result.push(tableBuffer[0].join(" | "))
      tableBuffer = []
      result.push(line)
    }
  }
  if (tableBuffer.length >= 2) result.push(formatTable(tableBuffer))
  else if (tableBuffer.length === 1) result.push(tableBuffer[0].join(" | "))
  return result.join("\n")
}

function formatTable(rows: string[][]): string {
  const maxCols = Math.max(...rows.map(r => r.length))
  const norm = rows.map(r => { while (r.length < maxCols) r.push(""); return r })
  const lines = ["| " + norm[0].join(" | ") + " |", "| " + norm[0].map(() => "---").join(" | ") + " |"]
  for (let i = 1; i < norm.length; i++) lines.push("| " + norm[i].join(" | ") + " |")
  return lines.join("\n")
}
