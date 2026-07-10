/**
 * 법령명 유사 매칭 유틸
 *
 * 사용자가 입력하는 법령명은 공식 약칭과 다른 경우가 많다
 * (예: "인공지능법" — 공식 약칭은 "인공지능기본법", 정식명은
 * "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법").
 * 법제처 lawNm 검색은 이런 입력에 0건을 반환하므로,
 * 어미(법/시행령 등)를 뗀 몸통으로 재검색한 뒤 후보를
 * 원본 입력과의 부분수열/포함 관계로 점수화해 걸러낸다.
 */

function normalizeName(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/[\s·•]/g, '')
}

/** query의 글자들이 target 안에 순서대로 모두 등장하는가 */
export function isNameSubsequence(query: string, target: string): boolean {
  if (!query || query.length > target.length) return false
  let ti = 0
  for (const ch of query) {
    ti = target.indexOf(ch, ti)
    if (ti === -1) return false
    ti++
  }
  return true
}

/** "인공지능법" → "인공지능", "중대재해처벌법 시행령" → "중대재해처벌" */
export function stripLawSuffix(query: string): string {
  return normalizeName(query).replace(/(시행규칙|시행령|법률|법|령|규칙)$/, '')
}

/**
 * 후보 법령이 사용자의 입력과 얼마나 맞는지 0~1000 점수.
 * 0 = 무관, 1000 = 정식명/약칭 완전일치.
 */
export function scoreLawNameMatch(query: string, lawName: string, abbreviation?: string): number {
  const q = normalizeName(query)
  const name = normalizeName(lawName)
  const abbr = abbreviation ? normalizeName(abbreviation) : ''
  if (!q || !name) return 0

  if (name === q || abbr === q) return 1000

  let best = 0
  // 약칭 부분수열: "인공지능법" ⊂ "인공지능기본법" — 가장 강한 신호
  if (q.length >= 3 && abbr && isNameSubsequence(q, abbr)) {
    best = Math.max(best, 800 - Math.min(abbr.length - q.length, 100))
  }
  // 정식명 부분수열
  if (q.length >= 3 && isNameSubsequence(q, name)) {
    best = Math.max(best, 600 - Math.min(name.length - q.length, 200))
  }
  // 어미 뗀 몸통이 이름/약칭에 통째로 포함 ("인공지능" ⊂ "산업 디지털 전환 및 인공지능 활용 촉진법")
  const stem = stripLawSuffix(q)
  if (best === 0 && stem.length >= 2 && (name.includes(stem) || (abbr && abbr.includes(stem)))) {
    best = 200
  }
  return best
}
