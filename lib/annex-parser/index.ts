/**
 * 별표 파일 통합 파서 (HWPX / HWP5 / PDF 분기)
 *
 * - HWPX (신형): manifest 멀티섹션, colSpan/rowSpan, 중첩 테이블
 * - HWP5 (구형): OLE2 직접 파싱, UTF-16LE 텍스트, 레코드 기반 테이블
 * - PDF: 파싱 불가 → null (Gemini Vision에 위임)
 *
 * korean-law-mcp 파서 포팅 (참고: github.com/roboco-io/hwp2md)
 */

import { parseHwpxDocument } from "./hwpx-parser"
import { parseHwp5Document } from "./hwp5-parser"

// ─── 매직바이트 감지 ─────────────────────────────────

export function isHwpxFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4))
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

export function isOldHwpFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4))
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

export function isPdfFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4))
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

// ─── 공통 인터페이스 ─────────────────────────────────

export interface AnnexParseResult {
  success: boolean
  markdown?: string
  fileType: "hwpx" | "hwp" | "pdf" | "unknown"
  error?: string
}

// ─── 메인 엔트리 ─────────────────────────────────────

export async function parseAnnexFile(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  if (isHwpxFile(buffer)) {
    return parseHwpx(buffer)
  }
  if (isOldHwpFile(buffer)) {
    return parseHwp(buffer)
  }
  if (isPdfFile(buffer)) {
    return { success: false, fileType: "pdf", error: "PDF 파일은 Gemini Vision으로 변환합니다." }
  }
  return { success: false, fileType: "unknown", error: "지원하지 않는 파일 형식입니다." }
}

// ─── HWPX 파서 ──────────────────────────────────────

async function parseHwpx(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  try {
    const markdown = await parseHwpxDocument(buffer)
    return { success: true, fileType: "hwpx", markdown }
  } catch (err) {
    return { success: false, fileType: "hwpx", error: err instanceof Error ? err.message : "HWPX 파싱 실패" }
  }
}

// ─── 구형 HWP 파서 ──────────────────────────────────

async function parseHwp(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  try {
    const markdown = parseHwp5Document(Buffer.from(buffer))
    return { success: true, fileType: "hwp", markdown }
  } catch (err) {
    return { success: false, fileType: "hwp", error: err instanceof Error ? err.message : "HWP 파싱 실패" }
  }
}
