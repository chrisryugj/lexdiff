/**
 * history-manager.ts
 *
 * History API 관리
 * - URL은 항상 '/' 유지
 * - 상태 기반으로 뷰 전환
 * - 뒤로가기/앞으로가기 지원
 */

/**
 * History 상태 데이터 구조
 */
export interface HistoryState {
  viewMode: 'home' | 'search-result' | 'precedent-detail' | 'impact-tracker' | 'ordinance-benchmark'
  searchId?: string
  searchMode?: 'basic' | 'rag'  // 검색 모드 (기본/AI)
  precedentId?: string  // 판례 상세 보기 시 판례 ID
  hasOrdinanceDetail?: boolean  // 조례 상세 보기 여부 (뒤로가기 시 목록 복원용)
  impactRequest?: { lawNames: string[]; dateFrom: string; dateTo: string }  // 영향 추적기 요청
  timestamp: number
}

/**
 * History 초기화
 * - 최초 방문 시 홈으로 초기화
 * - 새로고침 시 기존 상태 유지
 */
export function initializeHistory(): void {
  const currentState = window.history.state as HistoryState | null

  if (!currentState) {
    // 최초 방문: 홈 상태로 초기화
    const state: HistoryState = {
      viewMode: 'home',
      timestamp: Date.now()
    }
    window.history.replaceState(state, '', '/')
  }
  // 기존 상태가 있으면 그대로 유지 (새로고침 시)
}

/**
 * 검색 결과 페이지로 이동
 * - URL은 '/' 유지
 * - History에 검색 ID와 검색 모드 저장
 */
export function pushSearchHistory(
  searchId: string,
  searchMode: 'basic' | 'rag' = 'basic',
  options?: { hasOrdinanceDetail?: boolean }
): void {
  const state: HistoryState = {
    viewMode: 'search-result',
    searchId,
    searchMode,
    hasOrdinanceDetail: options?.hasOrdinanceDetail,
    timestamp: Date.now()
  }
  window.history.pushState(state, '', '/')
}

/**
 * 홈 페이지로 이동
 * - URL은 '/' 유지
 * - History에 홈 상태 저장
 */
export function pushHomeHistory(): void {
  const state: HistoryState = {
    viewMode: 'home',
    timestamp: Date.now()
  }
  window.history.pushState(state, '', '/')
}

/**
 * 현재 History 상태 조회
 */
export function getCurrentHistoryState(): HistoryState | null {
  return window.history.state as HistoryState | null
}

/**
 * 검색 결과 페이지 상태로 교체
 * - pushState 대신 replaceState 사용
 * - History 스택에 추가하지 않음
 */
export function replaceSearchHistory(searchId: string, searchMode: 'basic' | 'rag' = 'basic'): void {
  const state: HistoryState = {
    viewMode: 'search-result',
    searchId,
    searchMode,
    timestamp: Date.now()
  }
  window.history.replaceState(state, '', '/')
}

/**
 * 홈 페이지 상태로 교체
 * - pushState 대신 replaceState 사용
 * - History 스택에 추가하지 않음
 */
export function replaceHomeHistory(): void {
  const state: HistoryState = {
    viewMode: 'home',
    timestamp: Date.now()
  }
  window.history.replaceState(state, '', '/')
}

/**
 * 판례 상세 페이지로 이동
 * - URL은 '/' 유지
 * - History에 검색 ID + 판례 ID 저장
 */
export function pushPrecedentHistory(
  searchId: string,
  precedentId: string,
  searchMode: 'basic' | 'rag' = 'basic'
): void {
  const state: HistoryState = {
    viewMode: 'precedent-detail',
    searchId,
    precedentId,
    searchMode,
    timestamp: Date.now()
  }
  window.history.pushState(state, '', '/')
}

/**
 * 판례 상세 페이지 상태로 교체
 * - pushState 대신 replaceState 사용
 * - History 스택에 추가하지 않음
 */
export function replacePrecedentHistory(
  searchId: string,
  precedentId: string,
  searchMode: 'basic' | 'rag' = 'basic'
): void {
  const state: HistoryState = {
    viewMode: 'precedent-detail',
    searchId,
    precedentId,
    searchMode,
    timestamp: Date.now()
  }
  window.history.replaceState(state, '', '/')
}

/**
 * 영향 추적기 페이지로 이동
 */
export function pushImpactTrackerHistory(
  request: { lawNames: string[]; dateFrom: string; dateTo: string }
): void {
  const state: HistoryState = {
    viewMode: 'impact-tracker',
    impactRequest: request,
    timestamp: Date.now()
  }
  window.history.pushState(state, '', '/')
}

/**
 * PopState 이벤트 핸들러 타입
 */
export type PopStateHandler = (state: HistoryState | null) => void

/**
 * PopState 이벤트 리스너 등록
 * - 뒤로가기/앞으로가기 시 호출
 *
 * @param handler 상태 변경 핸들러
 * @returns 리스너 제거 함수
 */
export function onPopState(handler: PopStateHandler): () => void {
  const listener = (event: PopStateEvent) => {
    const state = event.state as HistoryState | null
    handler(state)
  }

  window.addEventListener('popstate', listener)

  return () => {
    window.removeEventListener('popstate', listener)
  }
}
