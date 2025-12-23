/**
 * 판례 XML/JSON 파서
 * korean-law-mcp/src/tools/precedents.ts 기반
 */

export interface PrecedentSearchResult {
  id: string           // 판례일련번호
  name: string         // 사건명
  caseNumber: string   // 사건번호
  court: string        // 법원명
  date: string         // 선고일자
  type: string         // 판결유형
  link: string         // 상세링크
}

export interface PrecedentDetail {
  name: string
  caseNumber: string
  court: string
  date: string
  caseType: string      // 사건종류명
  judgmentType: string  // 판결유형
  holdings: string      // 판시사항
  summary: string       // 판결요지
  refStatutes: string   // 참조조문
  refPrecedents: string // 참조판례
  fullText: string      // 전문
}

/**
 * 판례 검색 XML 파싱
 */
export function parsePrecedentSearchXML(xml: string): {
  totalCount: number
  precedents: PrecedentSearchResult[]
} {
  const precedents: PrecedentSearchResult[] = []

  // totalCnt 추출
  const totalCntMatch = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
  const totalCount = totalCntMatch ? parseInt(totalCntMatch[1], 10) : 0

  // prec 항목 추출 (with id attribute)
  const precMatches = xml.matchAll(/<prec[^>]*>([\s\S]*?)<\/prec>/g)

  for (const match of precMatches) {
    const precContent = match[1]

    const extractTag = (tag: string): string => {
      // CDATA 지원
      const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
      const cdataMatch = precContent.match(cdataRegex)
      if (cdataMatch) {
        // 줄 시작의 ? 문자 제거 (법제처 API 특수문자)
        return cdataMatch[1].trim().replace(/^[?？]\s*/gm, '')
      }

      const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`)
      const tagMatch = precContent.match(regex)
      return tagMatch ? tagMatch[1].trim().replace(/^[?？]\s*/gm, '') : ""
    }

    precedents.push({
      id: extractTag("판례일련번호"),
      name: extractTag("사건명"),
      caseNumber: extractTag("사건번호"),
      court: extractTag("법원명"),
      date: extractTag("선고일자"),
      type: extractTag("판결유형"),
      link: extractTag("판례상세링크")
    })
  }

  return { totalCount, precedents }
}

/**
 * 판례 전문 XML 파싱
 */
export function parsePrecedentDetailXML(xml: string): PrecedentDetail | null {
  const extractTag = (tag: string): string => {
    // CDATA 지원
    const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
    const cdataMatch = xml.match(cdataRegex)
    if (cdataMatch) {
      // 줄 시작의 ? 문자 제거 (법제처 API 특수문자)
      return cdataMatch[1].trim().replace(/^[?？]\s*/gm, '')
    }

    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`)
    const tagMatch = xml.match(regex)
    return tagMatch ? tagMatch[1].trim().replace(/^[?？]\s*/gm, '') : ""
  }

  const name = extractTag("사건명")
  if (!name) return null

  return {
    name,
    caseNumber: extractTag("사건번호"),
    court: extractTag("법원명"),
    date: extractTag("선고일자"),
    caseType: extractTag("사건종류명"),
    judgmentType: extractTag("판결유형"),
    holdings: extractTag("판시사항"),
    summary: extractTag("판결요지"),
    refStatutes: extractTag("참조조문"),
    refPrecedents: extractTag("참조판례"),
    fullText: extractTag("판례내용")
  }
}

/**
 * 판례 전문 JSON 파싱
 */
export function parsePrecedentDetailJSON(json: any): PrecedentDetail | null {
  if (!json?.PrecService) {
    return null
  }

  const prec = json.PrecService

  // 줄 시작의 ? 문자 제거 (법제처 API 특수문자) + 앞뒤 공백/빈줄 제거
  const clean = (s: string) => {
    return (s || "")
      .replace(/^[?？]\s*/gm, '')  // 줄 시작 ? 제거
      .replace(/\n{3,}/g, '\n\n')  // 연속된 빈줄 제거 (3개 이상 → 2개로)
      .trim()  // 앞뒤 공백 제거
  }

  return {
    name: clean(prec.사건명),
    caseNumber: clean(prec.사건번호),
    court: clean(prec.법원명),
    date: clean(prec.선고일자),
    caseType: clean(prec.사건종류명),
    judgmentType: clean(prec.판결유형),
    holdings: clean(prec.판시사항),
    summary: clean(prec.판결요지),
    refStatutes: clean(prec.참조조문),
    refPrecedents: clean(prec.참조판례),
    fullText: clean(prec.판례내용)
  }
}

/**
 * 선고일자 포맷 (YYYYMMDD -> YYYY-MM-DD)
 */
export function formatPrecedentDate(date: string): string {
  if (!date || date.length !== 8) return date
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}
