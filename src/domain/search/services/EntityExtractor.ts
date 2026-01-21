/**
 * EntityExtractor - 엔티티 추출 서비스
 *
 * 쿼리에서 법령명, 조문 번호, 판례 번호 등을 추출
 */

import {
  QUOTED_LAW_PATTERN,
  LAW_NAME_PATTERN,
  ARTICLE_PATTERN,
  EXCLUDED_WORDS,
  normalizeLawName
} from '../../patterns/LawPattern'

/**
 * 법령명 추출
 */
export function extractLaws(query: string): string[] {
  const laws = new Set<string>()

  // 1. 「」로 감싼 법령명 (가장 신뢰도 높음)
  const quotedPattern = new RegExp(QUOTED_LAW_PATTERN.source, 'g')
  let quotedMatch: RegExpExecArray | null
  while ((quotedMatch = quotedPattern.exec(query)) !== null) {
    laws.add(quotedMatch[1].trim())
  }

  // 2. 일반 법령명 패턴
  const lawNamePattern = new RegExp(LAW_NAME_PATTERN.source, 'g')
  let generalMatch: RegExpExecArray | null
  while ((generalMatch = lawNamePattern.exec(query)) !== null) {
    let lawName = generalMatch[1].trim()

    // 띄어쓰기 자동 삽입
    lawName = normalizeLawName(lawName)

    // 너무 짧거나 일반 단어인 경우 제외
    if (lawName.length >= 3 && !EXCLUDED_WORDS.includes(lawName)) {
      laws.add(lawName)
    }
  }

  return Array.from(laws)
}

/**
 * 조문 번호 추출
 */
export function extractArticles(query: string): string[] {
  const articles = new Set<string>()

  const articlePattern = new RegExp(ARTICLE_PATTERN.source, 'g')
  let match: RegExpExecArray | null

  while ((match = articlePattern.exec(query)) !== null) {
    const jo = match[1]
    const joSuffix = match[2] ? `의${match[2]}` : ''
    const hang = match[3] ? ` 제${match[3]}항` : ''
    articles.add(`제${jo}조${joSuffix}${hang}`)
  }

  return Array.from(articles)
}

/**
 * 쿼리 전처리 (RAG용)
 */
export function preprocessForRAG(query: string): string {
  let processed = query

  // 1. 조문 형식 정규화: "38조" → "제38조"
  processed = processed.replace(/(?<!제)(?<!\d)(\d+)조/g, '제$1조')

  // 2. 법령명 띄어쓰기 정규화
  processed = normalizeLawName(processed)

  // 3. 질문 어미 제거
  processed = processed
    .replace(/\?$/, '')
    .replace(/(인가요|인지요|할까요|일까요|나요|는지|은지)$/, '')
    .trim()

  return processed
}
