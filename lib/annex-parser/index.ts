/**
 * 별표 파일 통합 파서 — kordoc v3.0.0 위임
 *
 * HWPX/HWP5/PDF 모두 kordoc에 위임.
 * polyfill은 Vercel 서버리스 환경용 (DOMMatrix 등).
 *
 * @see https://github.com/chrisryugj/kordoc
 */

import { parse, isHwpxFile, isOldHwpFile, isPdfFile } from "kordoc"
import type { ParseResult } from "kordoc"
// polyfill 먼저 (ES 모듈 호이스팅되므로 별도 파일로 분리)
import "./pdf-polyfill"
// kordoc PDF 파싱 실패 시 직접 텍스트 추출용 (static import — Turbopack 호환)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
// kordoc HWPX 파싱 품질이 낮을 때 (헤딩만 나오는 경우) MCP 파서로 fallback
import { parseHwpxDocument } from "./hwpx-parser"

// ─── 타입 re-export ─────────────────────────────────

export type AnnexParseResult = ParseResult

export { isHwpxFile, isOldHwpFile, isPdfFile }

// ─── pdfjs-dist 직접 텍스트 추출 (kordoc 실패 시 fallback) ──

async function pdfFallback(buffer: ArrayBuffer): Promise<ParseResult> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise
  const lines: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (content.items as any[])
      .map((it) => it.str || "")
      .join(" ")
    if (text.trim()) lines.push(text.trim())
  }

  const markdown = lines.join("\n\n")
  if (!markdown) {
    return { success: false, fileType: "pdf", error: "텍스트 없음 (이미지 PDF)", isImageBased: true }
  }
  return { success: true, fileType: "pdf", markdown, blocks: [] }
}

// ─── 메인 엔트리 ─────────────────────────────────────

/** kordoc 결과가 헤딩만 나오는 품질 불량인지 판별 */
function isLowQualityHwpx(result: ParseResult): boolean {
  if (!result.success || result.fileType !== "hwpx") return false
  const md = result.markdown
  // 헤딩(## [별표)만 있고 본문이 거의 없으면 품질 불량
  const headingCount = (md.match(/^## \[별표/gm) || []).length
  const nonHeadingLines = md.split("\n").filter(l => l.trim() && !l.startsWith("## "))
  return headingCount >= 2 && nonHeadingLines.length < headingCount * 2
}

export async function parseAnnexFile(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  // kordoc가 buffer를 detach할 수 있으므로 fallback용 복사본 보관
  const bufferCopy = buffer.slice(0)
  const result = await parse(buffer)

  // kordoc HWPX 파싱 품질 불량 시 MCP 파서로 fallback
  if (isLowQualityHwpx(result)) {
    try {
      const markdown = await parseHwpxDocument(bufferCopy)
      if (markdown && result.success && markdown.length > result.markdown.length) {
        return { success: true, fileType: "hwpx", markdown, blocks: [] }
      }
    } catch {
      // fallback 실패 시 kordoc 결과 그대로 사용
    }
  }

  // kordoc PDF 파싱 실패 시 pdfjs-dist 직접 추출로 fallback
  if (!result.success && result.fileType === "pdf" && !result.isImageBased) {
    try {
      return await pdfFallback(bufferCopy)
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      return { ...result, error: `${result.error} [fallback: ${msg}]` } as ParseResult
    }
  }
  return result
}
