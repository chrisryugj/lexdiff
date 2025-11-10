/**
 * Article finder utilities
 * Helps find nearest articles when exact match not found
 */

import type { LawArticle } from './law-types'
import { formatJO } from './law-parser'

/**
 * Find nearest articles when requested article doesn't exist
 * Returns up to 3 suggestions
 */
export function findNearestArticles(
  requestedJo: string,
  availableArticles: LawArticle[]
): LawArticle[] {
  if (availableArticles.length === 0) return []

  // Parse requested JO code (AAAABB format)
  const requestedNum = parseInt(requestedJo.substring(0, 4), 10) // Article number
  const requestedBranch = parseInt(requestedJo.substring(4, 6), 10) // Branch number

  const suggestions: LawArticle[] = []

  // 1. Try same article number without branch (e.g., 10조의2 → 10조)
  if (requestedBranch > 0) {
    const baseJo = `${requestedJo.substring(0, 4)}00`
    const baseArticle = availableArticles.find(a => a.jo === baseJo)
    if (baseArticle) {
      suggestions.push(baseArticle)
    }
  }

  // 2. Try same article number with other branches
  const samArticlePrefix = requestedJo.substring(0, 4)
  const sameArticleBranches = availableArticles.filter(
    a => a.jo.startsWith(samArticlePrefix) && a.jo !== requestedJo
  )
  suggestions.push(...sameArticleBranches.slice(0, 2))

  // 3. Try previous/next article numbers
  if (suggestions.length < 3) {
    const prevJo = `${String(requestedNum - 1).padStart(4, '0')}00`
    const nextJo = `${String(requestedNum + 1).padStart(4, '0')}00`

    const prevArticle = availableArticles.find(a => a.jo === prevJo)
    const nextArticle = availableArticles.find(a => a.jo === nextJo)

    if (nextArticle && suggestions.length < 3) {
      suggestions.push(nextArticle)
    }
    if (prevArticle && suggestions.length < 3) {
      suggestions.push(prevArticle)
    }
  }

  // Remove duplicates and limit to 3
  const uniqueSuggestions = Array.from(
    new Map(suggestions.map(a => [a.jo, a])).values()
  )

  return uniqueSuggestions.slice(0, 3)
}

/**
 * Format article not found message
 */
export function formatArticleNotFoundMessage(
  lawName: string,
  requestedJo: string,
  nearestArticles: LawArticle[]
): string {
  const requestedDisplay = formatJO(requestedJo)

  let message = `${lawName}에 ${requestedDisplay}가(이) 존재하지 않습니다.`

  if (nearestArticles.length > 0) {
    const suggestions = nearestArticles
      .map(a => formatJO(a.jo))
      .join(', ')
    message += `\n\n다음 조문을 찾으시나요?\n${suggestions}`
  }

  return message
}

/**
 * Check if article exists in law
 */
export function articleExists(
  jo: string,
  articles: LawArticle[]
): boolean {
  return articles.some(a => a.jo === jo)
}
