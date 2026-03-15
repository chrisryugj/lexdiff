/**
 * 법령 타임머신 — 날짜 기반 법령 버전 찾기
 *
 * 연혁 데이터에서 특정 날짜에 유효한 법령 버전을 찾는다.
 */

/** 연혁 항목 (law-history API 응답) */
export interface HistoryItem {
  mst: string
  efYd: string         // 시행일 (YYYYMMDD)
  ancYd: string        // 공포일 (YYYYMMDD)
  ancNo: string        // 공포 번호 (법률 제12345호)
  rrCls: string        // 개정 유형 (일부개정, 타법개정, 전부개정 등)
  lawNm: string        // 법령명
}

/** 버전 검색 결과 */
export interface VersionMatch {
  pastVersion: HistoryItem
  currentVersion: HistoryItem
  betweenRevisions: HistoryItem[]  // 두 시점 사이 개정 이력
}

/** 캐시 키/TTL */
export function getTimeMachineCacheKey(mst: string, date: string): string {
  return `time-machine:${mst}:${date}`
}
export const TIME_MACHINE_CACHE_TTL = 24 * 60 * 60 * 1000

/**
 * 주어진 날짜에 유효한 법령 버전을 찾는다.
 *
 * @param histories 연혁 목록 (efYd 기준 내림차순 정렬 추천)
 * @param targetDate YYYY-MM-DD 또는 YYYYMMDD 형식
 * @param currentMst 현재 MST (현행법 식별)
 */
export function findVersionByDate(
  histories: HistoryItem[],
  targetDate: string,
  currentMst: string,
): VersionMatch | null {
  // 날짜 정규화 (YYYYMMDD)
  const normalizedDate = targetDate.replace(/-/g, '')

  // 시행일 ≤ targetDate인 항목 중 가장 최신
  const pastCandidates = histories
    .filter(h => h.efYd <= normalizedDate)
    .sort((a, b) => b.efYd.localeCompare(a.efYd))

  if (pastCandidates.length === 0) return null

  const pastVersion = pastCandidates[0]

  // 현행 버전 찾기
  const currentVersion = histories.find(h => h.mst === currentMst)
    || histories.sort((a, b) => b.efYd.localeCompare(a.efYd))[0]

  if (!currentVersion) return null

  // 두 시점 사이 개정 이력
  const betweenRevisions = histories
    .filter(h => h.efYd > pastVersion.efYd && h.efYd <= currentVersion.efYd)
    .sort((a, b) => a.efYd.localeCompare(b.efYd))

  return {
    pastVersion,
    currentVersion,
    betweenRevisions,
  }
}

/** YYYYMMDD → YYYY.MM.DD 형식 변환 */
export function formatDateDisplay(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`
}

/** YYYYMMDD → YYYY-MM-DD */
export function formatDateInput(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}
