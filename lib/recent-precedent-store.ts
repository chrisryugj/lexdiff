/**
 * recent-precedent-store.ts
 *
 * 최근 조회한 판례 저장소
 * - localStorage 기반
 * - 최대 10개 보관
 */

const STORAGE_KEY = 'lexdiff-recent-precedents'
const MAX_RECENT = 10

/**
 * 최근 조회 판례 데이터 구조
 */
export interface RecentPrecedent {
  id: string              // 판례 ID
  caseNumber: string      // 사건번호 (예: "2025다12345")
  caseName: string        // 사건명 (예: "손해배상(기)")
  court: string           // 법원 (예: "대법원")
  date: string            // 선고일자
  viewedAt: number        // 조회 시각 (timestamp)
}

/**
 * 최근 조회 판례 목록 가져오기
 */
export function getRecentPrecedents(): RecentPrecedent[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch (error) {
    console.error('최근 판례 로드 실패:', error)
    return []
  }
}

/**
 * 최근 조회 판례 추가
 */
export async function addRecentPrecedent(precedent: Omit<RecentPrecedent, 'viewedAt'>): Promise<void> {
  try {
    console.log('[최근판례] 저장 시도:', precedent)

    const current = getRecentPrecedents()

    const newPrecedent: RecentPrecedent = {
      ...precedent,
      viewedAt: Date.now()
    }

    // 중복 제거 후 맨 앞에 추가
    const updated = [
      newPrecedent,
      ...current.filter(p => p.id !== precedent.id)
    ].slice(0, MAX_RECENT)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    console.log('[최근판례] 저장 완료:', updated.length, '개')
  } catch (error) {
    console.error('[최근판례] 저장 실패:', error)
  }
}

/**
 * 특정 판례 삭제
 */
export function removeRecentPrecedent(id: string): void {
  try {
    const current = getRecentPrecedents()
    const updated = current.filter(p => p.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('최근 판례 삭제 실패:', error)
  }
}

/**
 * 전체 삭제
 */
export function clearRecentPrecedents(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('최근 판례 전체 삭제 실패:', error)
  }
}
