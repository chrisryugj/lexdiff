/**
 * 결정론적 라인 단위 신·구 조문 diff (LCS 기반).
 *
 * AI 변경요약 하이브리드의 "사실" 레이어 — 같은 입력이면 항상 같은 출력이라
 * AI 환각 없이 무엇이 바뀌었는지 정확히 보여준다. AI 는 이 위에 '해설'만 얹는다.
 * 외부 diff 라이브러리 없이 표준 LCS DP 로 구현(의존성 0).
 */

export type DiffOpType = 'same' | 'add' | 'del'
export interface DiffOp {
  type: DiffOpType
  text: string
}

// 조문 텍스트가 매우 길 때 LCS DP(O(n·m) 메모리) 폭발 방지용 라인 상한.
// 초과분은 잘라내고 잘렸음을 호출부가 알 수 있도록 truncated 플래그를 노출한다.
const MAX_LINES = 1200

/** 조문 텍스트를 비교 가능한 라인 배열로 정규화 (<P> 문단 마커·잔여 태그 제거, 공백 라인 제거). */
function toLines(s: string): string[] {
  return s
    .replace(/<\/?P>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
}

export interface LineDiffResult {
  ops: DiffOp[]
  added: number
  removed: number
  truncated: boolean
}

/**
 * 구법/신법 텍스트를 라인 단위로 비교한다.
 * @returns ops(순서 보존된 same/add/del 목록) + 추가·삭제 라인 수 + 상한 초과 여부
 */
export function diffLines(oldText: string, newText: string): LineDiffResult {
  let a = toLines(oldText)
  let b = toLines(newText)
  const truncated = a.length > MAX_LINES || b.length > MAX_LINES
  if (a.length > MAX_LINES) a = a.slice(0, MAX_LINES)
  if (b.length > MAX_LINES) b = b.slice(0, MAX_LINES)

  const n = a.length
  const m = b.length

  // LCS 길이 DP (뒤에서 앞으로 채워 역추적이 앞에서부터 가능하게).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] })
      removed++
      i++
    } else {
      ops.push({ type: 'add', text: b[j] })
      added++
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'del', text: a[i++] })
    removed++
  }
  while (j < m) {
    ops.push({ type: 'add', text: b[j++] })
    added++
  }

  return { ops, added, removed, truncated }
}
