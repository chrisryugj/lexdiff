/**
 * RAG Content Filter
 * 조례/법령 데이터가 클 때 관련 조문만 필터링하여 AI에 전달
 */

import type { LawArticle } from './law-parser'
import type { CollectedSource } from './rag-data-collector'

interface FilterConfig {
  maxArticles?: number // 최대 조문 수 (기본: 30)
  maxContentLength?: number // 최대 콘텐츠 길이 (기본: 15000 chars)
  includeTableOfContents?: boolean // 목차 포함 여부
}

interface FilteredSource {
  source: CollectedSource
  filteredContent: string
  includedArticles: LawArticle[]
  excludedCount: number
  filterMethod: 'all' | 'keyword' | 'toc' | 'summary'
}

/**
 * 소스 데이터를 필터링하여 AI에 최적화된 형태로 변환
 */
export function filterSourceForRAG(
  source: CollectedSource,
  keywords: string[],
  config: FilterConfig = {}
): FilteredSource {
  const {
    maxArticles = 30,
    maxContentLength = 15000,
    includeTableOfContents = true,
  } = config

  const totalArticles = source.articles.length

  // 1. 조문 수가 적으면 전체 포함
  if (totalArticles <= maxArticles && source.content.length <= maxContentLength) {
    return {
      source,
      filteredContent: source.content,
      includedArticles: source.articles,
      excludedCount: 0,
      filterMethod: 'all',
    }
  }

  // 2. 키워드 기반 필터링
  const keywordFiltered = filterByKeywords(source.articles, keywords, maxArticles)

  if (keywordFiltered.length > 0) {
    const content = buildFilteredContent(source, keywordFiltered, includeTableOfContents)

    return {
      source,
      filteredContent: content,
      includedArticles: keywordFiltered,
      excludedCount: totalArticles - keywordFiltered.length,
      filterMethod: 'keyword',
    }
  }

  // 3. 키워드 매칭 실패 → 목차 + 주요 조문만
  if (includeTableOfContents) {
    const tocContent = buildTableOfContents(source)
    const importantArticles = getImportantArticles(source.articles, Math.min(10, maxArticles))
    const content = tocContent + '\n\n' + buildFilteredContent(source, importantArticles, false)

    return {
      source,
      filteredContent: content,
      includedArticles: importantArticles,
      excludedCount: totalArticles - importantArticles.length,
      filterMethod: 'toc',
    }
  }

  // 4. 최후의 수단: 요약본
  const summary = summarizeSource(source)

  return {
    source,
    filteredContent: summary,
    includedArticles: [],
    excludedCount: totalArticles,
    filterMethod: 'summary',
  }
}

/**
 * 키워드 기반 조문 필터링
 */
function filterByKeywords(
  articles: LawArticle[],
  keywords: string[],
  maxCount: number
): LawArticle[] {
  if (keywords.length === 0) return []

  // 키워드 정규화 (소문자, 공백 제거)
  const normalizedKeywords = keywords.map((k) => k.toLowerCase().replace(/\s+/g, ''))

  // 각 조문에 대해 키워드 매칭 점수 계산
  const scored = articles.map((article) => {
    const searchText = `${article.joNum} ${article.content}`.toLowerCase().replace(/\s+/g, '')

    let score = 0

    for (const keyword of normalizedKeywords) {
      // 완전 매칭
      if (searchText.includes(keyword)) {
        score += 10
      }

      // 부분 매칭 (3글자 이상)
      if (keyword.length >= 3) {
        const partialMatches = searchText.split(keyword).length - 1
        score += partialMatches * 5
      }
    }

    return { article, score }
  })

  // 점수 높은 순으로 정렬
  scored.sort((a, b) => b.score - a.score)

  // 점수가 0보다 큰 조문만 선택 (최대 maxCount개)
  const filtered = scored.filter((s) => s.score > 0).slice(0, maxCount)

  console.log(`📊 [Keyword Filter] Matched ${filtered.length}/${articles.length} articles`)

  return filtered.map((s) => s.article)
}

/**
 * 중요 조문 추출 (목적, 정의, 지원대상 등)
 */
function getImportantArticles(articles: LawArticle[], maxCount: number): LawArticle[] {
  const importantPatterns = [
    /목적/,
    /정의/,
    /용어/,
    /지원대상/,
    /지원내용/,
    /예산/,
    /재원/,
    /시행일/,
    /부칙/,
  ]

  const important = articles.filter((article) => {
    const text = `${article.joNum} ${article.content}`
    return importantPatterns.some((pattern) => pattern.test(text))
  })

  // 부족하면 앞쪽 조문으로 채움
  if (important.length < maxCount) {
    const remaining = maxCount - important.length
    const early = articles.slice(0, remaining).filter((a) => !important.includes(a))
    important.push(...early)
  }

  return important.slice(0, maxCount)
}

/**
 * 목차 생성
 */
function buildTableOfContents(source: CollectedSource): string {
  const toc = source.articles
    .map((article, index) => {
      // 조문 제목 추출 (괄호 안 내용)
      const titleMatch = article.joNum.match(/\(([^)]+)\)/)
      const title = titleMatch ? titleMatch[1] : ''

      return `${article.jo}. ${article.joNum}${title ? ` - ${title}` : ''}`
    })
    .join('\n')

  return `**목차 (총 ${source.articles.length}개 조문)**\n\n${toc}\n\n**참고**: 전체 조문이 많아 일부만 표시합니다. 필요 시 특정 조문을 요청하세요.`
}

/**
 * 필터링된 콘텐츠 구성
 */
function buildFilteredContent(
  source: CollectedSource,
  articles: LawArticle[],
  includeToc: boolean
): string {
  let content = ''

  if (includeToc) {
    content += buildTableOfContents(source) + '\n\n---\n\n'
  }

  content += `**주요 조문 (${articles.length}개)**\n\n`
  content += articles.map((a) => `${a.joNum}\n${a.content}`).join('\n\n')

  return content
}

/**
 * 소스 요약본 생성 (최후의 수단)
 */
function summarizeSource(source: CollectedSource): string {
  const firstFew = source.articles.slice(0, 5)
  const summary = firstFew.map((a) => `${a.joNum}\n${a.content}`).join('\n\n')

  return `**요약** (전체 ${source.articles.length}개 조문 중 처음 5개)\n\n${summary}\n\n**참고**: 전체 내용이 매우 길어 일부만 표시합니다.`
}

/**
 * 여러 소스에 대해 일괄 필터링
 */
export function filterMultipleSources(
  sources: CollectedSource[],
  keywords: string[],
  config?: FilterConfig
): FilteredSource[] {
  return sources.map((source) => filterSourceForRAG(source, keywords, config))
}

/**
 * 필터 결과 로깅
 */
export function logFilterResults(filtered: FilteredSource[]) {
  console.log('📊 [Content Filter Results]')

  filtered.forEach((f, index) => {
    console.log(`\nSource ${index + 1}: ${f.source.title}`)
    console.log(`  Method: ${f.filterMethod}`)
    console.log(`  Included: ${f.includedArticles.length} articles`)
    console.log(`  Excluded: ${f.excludedCount} articles`)
    console.log(`  Content length: ${f.filteredContent.length} chars`)
  })
}
