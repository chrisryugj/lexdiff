/**
 * search-id-generator.ts
 *
 * 검색 ID 생성 유틸리티
 * 각 검색 세션을 고유하게 식별하기 위한 ID를 생성합니다.
 */

/**
 * 고유한 검색 ID 생성
 *
 * 형식: search-{timestamp}-{random}
 * 예시: search-1699876543210-a3f5k2
 *
 * @returns 생성된 검색 ID
 */
export function generateSearchId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `search-${timestamp}-${random}`
}
