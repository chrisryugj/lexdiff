/**
 * 법제처 XML 응답 파서 헬퍼
 *
 * fast-xml-parser 기반. 정규식 파싱의 CDATA/중첩/공백 취약점을 회피.
 * 법제처가 마크업을 변경해도 안정적으로 동작.
 */

import { XMLParser } from 'fast-xml-parser'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  cdataPropName: '__cdata',
  textNodeName: '#text',
})

/** 법제처 XML 텍스트를 안전하게 파싱 (CDATA/공백 처리 자동) */
export function parseLawXml<T = unknown>(xml: string): T {
  return xmlParser.parse(xml) as T
}

/**
 * 노드의 텍스트 컨텐츠를 안전하게 추출
 * - string인 경우 그대로
 * - object인 경우 #text 또는 __cdata 우선
 * - null/undefined → 빈 문자열
 */
export function extractText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node.trim()
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.__cdata === 'string') return obj.__cdata.trim()
    if (typeof obj['#text'] === 'string') return obj['#text'].trim()
    // 일부 응답에서 #text가 number로 파싱되는 경우
    if (typeof obj['#text'] === 'number') return String(obj['#text'])
  }
  return ''
}

/** 항목을 항상 배열로 반환 (단일 객체/배열/undefined 모두 처리) */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

/** 법제처가 200으로 HTML 에러 페이지를 반환하는 경우 감지 */
export function isHtmlErrorPage(xml: string): boolean {
  const trimmed = xml.trimStart()
  return trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
}

// ─── 법령 검색 결과 타입 (lawSearch.do?target=law) ───

export interface ParsedLawSearchItem {
  lawId: string
  lawNameHangul: string
  lawNameAbbreviation: string
  mst: string
  effectiveDate: string
  promulgationDate: string
  promulgationNumber: string
  lawType: string
  ministry: string
  detailLink: string
}

interface RawLawNode {
  법령ID?: unknown
  법령명한글?: unknown
  법령약칭명?: unknown
  법령일련번호?: unknown
  시행일자?: unknown
  공포일자?: unknown
  공포번호?: unknown
  법령구분명?: unknown
  소관부처명?: unknown
  법령상세링크?: unknown
}

interface RawLawSearchResponse {
  LawSearch?: {
    totalCnt?: unknown
    law?: RawLawNode | RawLawNode[]
  }
}

/** lawSearch.do XML 응답을 안전 파싱 (정규식 대신 사용) */
export function parseLawSearchXml(xml: string): {
  totalCount: number
  laws: ParsedLawSearchItem[]
} {
  if (isHtmlErrorPage(xml)) {
    return { totalCount: 0, laws: [] }
  }
  const root = parseLawXml<RawLawSearchResponse>(xml)
  const search = root.LawSearch
  if (!search) return { totalCount: 0, laws: [] }
  const totalCount = Number(extractText(search.totalCnt) || 0) || 0
  const laws = asArray(search.law).map((node): ParsedLawSearchItem => ({
    lawId: extractText(node.법령ID),
    lawNameHangul: extractText(node.법령명한글),
    lawNameAbbreviation: extractText(node.법령약칭명),
    mst: extractText(node.법령일련번호),
    effectiveDate: extractText(node.시행일자),
    promulgationDate: extractText(node.공포일자),
    promulgationNumber: extractText(node.공포번호),
    lawType: extractText(node.법령구분명),
    ministry: extractText(node.소관부처명),
    detailLink: extractText(node.법령상세링크),
  }))
  return { totalCount, laws }
}
