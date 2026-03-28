/**
 * 별표 파일 통합 파서 — kordoc 라이브러리 래퍼
 *
 * HWPX, HWP5, PDF 모두 kordoc이 순수 파싱으로 처리.
 * AI(Gemini Vision) 의존 없이 확정적으로 동작.
 *
 * @see https://github.com/chrisryugj/kordoc
 */

import { parse, isHwpxFile, isOldHwpFile, isPdfFile } from "kordoc"
import type { ParseResult } from "kordoc"

// ─── 타입 re-export ─────────────────────────────────

export type AnnexParseResult = ParseResult

export { isHwpxFile, isOldHwpFile, isPdfFile }

// ─── 메인 엔트리 ─────────────────────────────────────

export async function parseAnnexFile(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  return parse(buffer)
}
