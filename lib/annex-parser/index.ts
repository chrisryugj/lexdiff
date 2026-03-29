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

// ─── 메인 엔트리 ─────────────────────────────────────

export async function parseAnnexFile(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  return parse(buffer)
}
