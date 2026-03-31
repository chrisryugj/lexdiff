/**
 * 별표 파일 통합 파서 — kordoc v1.5.0 위임
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

// ─── 타입 re-export ─────────────────────────────────

export type AnnexParseResult = ParseResult

export { isHwpxFile, isOldHwpFile, isPdfFile }

// ─── pdfjs-dist 직접 텍스트 추출 (kordoc 실패 시 fallback) ──

async function pdfFallback(buffer: ArrayBuffer): Promise<ParseResult> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
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

export async function parseAnnexFile(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  const result = await parse(buffer)
  // kordoc PDF 파싱 실패 시 pdfjs-dist 직접 추출로 fallback
  if (!result.success && result.fileType === "pdf" && !result.isImageBased) {
    try {
      return await pdfFallback(buffer)
    } catch {
      // fallback도 실패하면 원래 에러 반환
    }
  }
  return result
}
