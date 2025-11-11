/**
 * 텍스트 유사도 계산 유틸리티
 * 레벤슈타인 거리 기반
 */

/**
 * 두 문자열의 유사도를 0~1 범위로 계산
 * 1.0 = 완전히 동일
 * 0.0 = 완전히 다름
 */
export function calculateSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) return 1.0

  // 정확히 일치
  if (a === b) return 1.0

  // startsWith 매칭 (80%)
  if (longer.startsWith(shorter)) return 0.8

  // contains 매칭 (60%)
  if (longer.includes(shorter)) return 0.6

  // 레벤슈타인 거리 기반 유사도
  const distance = levenshteinDistance(a, b)
  return (longer.length - distance) / longer.length
}

/**
 * 레벤슈타인 거리 계산
 * 두 문자열 간의 최소 편집 거리
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  // 초기화
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // 동적 프로그래밍
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * 여러 후보 중 가장 유사한 것을 찾음
 */
export function findMostSimilar<T>(
  target: string,
  candidates: T[],
  getText: (item: T) => string,
  minSimilarity = 0.6,
): { item: T; similarity: number } | null {
  if (candidates.length === 0) return null

  const scored = candidates.map((item) => ({
    item,
    similarity: calculateSimilarity(target, getText(item)),
  }))

  // 유사도 높은 순으로 정렬
  scored.sort((a, b) => b.similarity - a.similarity)

  const best = scored[0]

  // 최소 유사도 체크
  if (best.similarity < minSimilarity) return null

  return best
}
