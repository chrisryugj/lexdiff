const VISITED_LAWS_KEY = 'lexdiff-visited-laws'

export function getVisitedLaws(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(VISITED_LAWS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

export function markLawVisited(lawKey: string) {
  if (typeof window === 'undefined') return
  try {
    const visited = getVisitedLaws()
    visited.add(lawKey)
    // 최대 500개까지만 저장
    const arr = Array.from(visited).slice(-500)
    localStorage.setItem(VISITED_LAWS_KEY, JSON.stringify(arr))
  } catch {
    // localStorage 에러 무시
  }
}
