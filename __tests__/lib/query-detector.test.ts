import { describe, it, expect } from 'vitest'
import { detectQueryType } from '../../lib/query-detector'

describe('query-detector', () => {
  it('treats "규정" law titles as structured (avoid law/AI choice modal)', () => {
    const result = detectQueryType('지방공무원 복무규정')
    expect(result.type).toBe('structured')
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })
})

