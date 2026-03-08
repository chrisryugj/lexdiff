/**
 * SearchResultList 컴포넌트 테스트
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LawSearchResultList, OrdinanceSearchResultList } from '@/components/search-result-view/SearchResultList'

describe('LawSearchResultList', () => {
  const mockResults = [
    {
      lawId: '001706',
      lawName: '민법',
      lawType: '법률',
      promulgationDate: '20230101',
      effectiveDate: '20230701'
    },
    {
      lawId: '001707',
      mst: 'MST001',
      lawName: '민법 시행령',
      lawType: '대통령령',
      promulgationDate: '20230201',
      effectiveDate: '20230801'
    },
    {
      lawId: '001708',
      lawName: '민법 시행규칙',
      lawType: '부령',
    }
  ]

  const mockQuery = { lawName: '민법' }
  const mockRelatedSearches = [
    {
      keyword: '민사법',
      results: [
        { lawId: '002', lawName: '민사소송법', lawType: '법률' }
      ]
    }
  ]

  it('검색 결과 리스트 렌더링', () => {
    render(
      <LawSearchResultList
        results={mockResults}
        query={mockQuery}
        relatedSearches={[]}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('법령 검색 결과')).toBeInTheDocument()
    expect(screen.getByText('3건')).toBeInTheDocument()
    expect(screen.getByText('민법')).toBeInTheDocument()
    expect(screen.getByText('민법 시행령')).toBeInTheDocument()
    expect(screen.getByText('민법 시행규칙')).toBeInTheDocument()
  })

  it('법령 타입별 Badge 표시', () => {
    render(
      <LawSearchResultList
        results={mockResults}
        query={mockQuery}
        relatedSearches={[]}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('법률')).toBeInTheDocument()
    expect(screen.getByText('대통령령')).toBeInTheDocument()
    expect(screen.getByText('부령')).toBeInTheDocument()
  })

  it('법령 클릭 시 onSelect 호출', () => {
    const onSelect = vi.fn()

    render(
      <LawSearchResultList
        results={mockResults}
        query={mockQuery}
        relatedSearches={[]}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('민법'))

    expect(onSelect).toHaveBeenCalledWith(mockResults[0])
  })

  it('취소 버튼 클릭 시 onCancel 호출', () => {
    const onCancel = vi.fn()

    render(
      <LawSearchResultList
        results={mockResults}
        query={mockQuery}
        relatedSearches={[]}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByText('취소'))

    expect(onCancel).toHaveBeenCalled()
  })

  it('관련 검색어 섹션 표시', () => {
    render(
      <LawSearchResultList
        results={mockResults}
        query={mockQuery}
        relatedSearches={mockRelatedSearches}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('관련 검색어')).toBeInTheDocument()
    expect(screen.getByText('민사법')).toBeInTheDocument()
    expect(screen.getByText('민사소송법')).toBeInTheDocument()
  })

  it('관련 검색어 클릭 시 onSelect 호출', () => {
    const onSelect = vi.fn()

    render(
      <LawSearchResultList
        results={mockResults}
        query={mockQuery}
        relatedSearches={mockRelatedSearches}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('민사소송법'))

    expect(onSelect).toHaveBeenCalledWith(mockRelatedSearches[0].results[0])
  })

  it('공포일/시행일 표시', () => {
    render(
      <LawSearchResultList
        results={mockResults}
        query={mockQuery}
        relatedSearches={[]}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    // formatDate가 적용된 날짜 형식 확인 (Badge에 "공포 YYYY-MM-DD" 형식)
    expect(screen.getAllByText(/공포\s/)).toHaveLength(2)
    expect(screen.getAllByText(/시행\s/)).toHaveLength(2)
  })
})

describe('OrdinanceSearchResultList', () => {
  const mockOrdinances = [
    {
      ordinSeq: '001',
      ordinName: '서울특별시 주택조례',
      ordinId: 'ORD001',
      promulgationDate: '20230101',
      effectiveDate: '20230201',
      orgName: '서울특별시',
      ordinKind: '조례'
    },
    {
      ordinSeq: '002',
      ordinName: '부산광역시 환경보전조례',
      ordinId: 'ORD002',
      effectiveDate: '20230301',
      orgName: '부산광역시',
      ordinKind: '조례'
    }
  ]

  const mockQuery = { lawName: '조례' }

  it('조례 검색 결과 리스트 렌더링', () => {
    render(
      <OrdinanceSearchResultList
        results={mockOrdinances}
        query={mockQuery}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('조례 검색 결과')).toBeInTheDocument()
    expect(screen.getByText('2건')).toBeInTheDocument()
    expect(screen.getByText('서울특별시 주택조례')).toBeInTheDocument()
    expect(screen.getByText('부산광역시 환경보전조례')).toBeInTheDocument()
  })

  it('조례 종류 Badge 표시', () => {
    render(
      <OrdinanceSearchResultList
        results={mockOrdinances}
        query={mockQuery}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getAllByText('조례')).toHaveLength(2)
  })

  it('지자체명 표시', () => {
    render(
      <OrdinanceSearchResultList
        results={mockOrdinances}
        query={mockQuery}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('서울특별시')).toBeInTheDocument()
    expect(screen.getByText('부산광역시')).toBeInTheDocument()
  })

  it('조례 클릭 시 onSelect 호출', () => {
    const onSelect = vi.fn()

    render(
      <OrdinanceSearchResultList
        results={mockOrdinances}
        query={mockQuery}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('서울특별시 주택조례'))

    expect(onSelect).toHaveBeenCalledWith(mockOrdinances[0])
  })

  it('취소 버튼 클릭 시 onCancel 호출', () => {
    const onCancel = vi.fn()

    render(
      <OrdinanceSearchResultList
        results={mockOrdinances}
        query={mockQuery}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByText('취소'))

    expect(onCancel).toHaveBeenCalled()
  })
})
