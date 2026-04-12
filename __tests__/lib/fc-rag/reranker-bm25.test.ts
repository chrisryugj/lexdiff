/**
 * H-RAG1: BM25 reranker
 */
import { describe, test, expect } from 'vitest'
import { rerankAiSearchResult } from '@/lib/fc-rag/result-utils'

const searchResult = (blocks: string[]) =>
  `총 ${blocks.length}건 검색\n` + blocks.join('\n\n')

describe('rerankAiSearchResult BM25 (H-RAG1)', () => {
  test('쿼리 키워드가 법령명에 있는 조문이 최상단', () => {
    const blocks = [
      `📜 민법 제1조\n민사에 관한 사항`,
      `📜 관세법 제38조\n수입신고시 관세를 납부`,
      `📜 형법 제10조\n심신상실자`,
    ]
    const input = searchResult(blocks)
    const out = rerankAiSearchResult(input, '관세법 신고납부')
    const reordered = out.split(/(?=📜)/).slice(1) // skip header
    expect(reordered[0]).toContain('관세법')
  })

  test('조문번호 완전 일치는 BM25보다 우선 (large boost)', () => {
    const blocks = [
      `📜 관세법 제1조\n목적 규정. 관세 관세 관세 관세`, // 키워드 많음
      `📜 관세법 제38조\n신고납부 제도`,
    ]
    const out = rerankAiSearchResult(searchResult(blocks), '관세법 제38조')
    const first = out.split(/(?=📜)/)[1]
    expect(first).toContain('제38조')
  })

  test('관련 없는 조문은 score 0로 드롭 (≥3개 positive 존재시)', () => {
    const blocks = [
      `📜 관세법 제38조\n수입신고 납부`,
      `📜 관세법 제39조\n과세전통지`,
      `📜 관세법 제40조\n납부고지`,
      `📜 민법 제100조\n종물`, // 관련없음
    ]
    const out = rerankAiSearchResult(searchResult(blocks), '관세 납부 신고')
    expect(out).not.toContain('민법 제100조')
  })

  test('1건 이하면 원본 반환', () => {
    const input = `총 1건 검색\n📜 관세법 제38조\n내용`
    expect(rerankAiSearchResult(input, '관세')).toBe(input)
  })

  test('BM25: 짧은 조문이 긴 조문만큼 점수 받을 수 있음 (길이 정규화)', () => {
    const blocks = [
      `📜 관세법 제38조\n신고납부 수입신고시 관세를 납부 ${'공백 '.repeat(200)}`, // 매우 긴 블록, 키워드 밀도 낮음
      `📜 관세법 제38조의2\n신고납부 수입신고 관세 납부`, // 짧고 밀도 높음
    ]
    const out = rerankAiSearchResult(searchResult(blocks), '신고납부 관세')
    // 짧고 밀도 높은 쪽이 앞에 와야 BM25다움
    const firstBlock = out.split(/(?=📜)/)[1]
    expect(firstBlock).toContain('제38조의2')
  })
})
