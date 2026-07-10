/**
 * LLM이 생성한 마크다운 표를 GFM 파서(remark-gfm)가 확실히 인식하도록 정규화.
 *
 * LLM 출력에서 실제로 관측된 깨짐 유형:
 * 1. 헤더 다음 구분행(|---|---|) 누락 → remark-gfm이 표로 인식 못 함
 * 2. 셀 내부 개행 → 행이 중간에 끊겨 표가 조기 종료
 * 3. 표 전체를 ```로 감싼 코드펜스 → 리터럴 텍스트로 렌더
 * 4. 행별 열 개수 불일치 → 열 정렬 붕괴
 */

/** 코드펜스로 감싼 표를 벗겨낸다 (``` 또는 ```markdown) */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return fenced ? fenced[1] : text
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith('|')
}

function isDelimiterRow(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

/** "| a | b |" → ["a", "b"] */
function splitCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

export function normalizeMarkdownTable(raw: string): string {
  if (!raw) return raw
  let text = stripCodeFence(raw.replace(/\r\n/g, '\n')).trim()
  if (!text.includes('|')) return text

  // 1) 셀 내부 개행 복구: 표 행 사이에 끼인 비-표 라인은
  //    직전 행의 마지막 셀에서 잘려나온 조각이므로 이어 붙인다.
  const lines = text.split('\n')
  const merged: string[] = []
  for (const line of lines) {
    const prev = merged[merged.length - 1]
    const isContinuation =
      prev !== undefined &&
      isTableRow(prev) &&
      !isTableRow(line) &&
      line.trim() !== ''
    if (isContinuation) {
      // 직전 표 행의 닫는 파이프 앞에 이어붙임
      merged[merged.length - 1] = prev.replace(/\|\s*$/, '') + ' ' + line.trim() + ' |'
    } else {
      merged.push(line)
    }
  }

  // 2) 표 블록 탐색: 첫 표 행 ~ 연속된 표 행
  const rows = merged
  const firstIdx = rows.findIndex(isTableRow)
  if (firstIdx === -1) return rows.join('\n')

  let lastIdx = firstIdx
  while (lastIdx + 1 < rows.length && isTableRow(rows[lastIdx + 1])) lastIdx++

  const before = rows.slice(0, firstIdx)
  const table = rows.slice(firstIdx, lastIdx + 1)
  const after = rows.slice(lastIdx + 1)

  const headerCols = splitCells(table[0]).length

  // 3) 구분행 보장: 헤더 바로 다음이 구분행이 아니면 삽입
  if (table.length === 1 || !isDelimiterRow(table[1])) {
    table.splice(1, 0, `|${Array(headerCols).fill('---').join('|')}|`)
  }

  // 4) 열 개수 정합: 부족하면 빈 셀 패딩, 넘치면 초과분을 마지막 셀에 병합
  const normalized = table.map((row, i) => {
    if (i === 1) return row // 구분행은 위에서 보장됨
    const cells = splitCells(row)
    if (cells.length < headerCols) {
      while (cells.length < headerCols) cells.push('')
    } else if (cells.length > headerCols) {
      const overflow = cells.splice(headerCols - 1).join(' / ')
      cells.push(overflow)
      cells.splice(headerCols)
    }
    return `| ${cells.join(' | ')} |`
  })
  // 구분행도 헤더 열 수에 맞춤
  normalized[1] = `|${Array(headerCols).fill('---').join('|')}|`

  return [...before, ...normalized, ...after].join('\n')
}
