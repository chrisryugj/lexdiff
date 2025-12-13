/**
 * SearchDialogs 컴포넌트 테스트
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchChoiceDialog, NoResultDialog } from '@/components/search-result-view/SearchDialogs'

describe('SearchChoiceDialog', () => {
  const mockPendingQuery = { lawName: '도로법', article: '점용허가' }

  it('다이얼로그 열림 상태에서 내용 표시', () => {
    render(
      <SearchChoiceDialog
        open={true}
        onOpenChange={vi.fn()}
        pendingQuery={mockPendingQuery}
        onChoice={vi.fn()}
      />
    )

    expect(screen.getByText('검색 방법을 선택하세요')).toBeInTheDocument()
    expect(screen.getByText(/도로법/)).toBeInTheDocument()
    expect(screen.getByText(/점용허가/)).toBeInTheDocument()
  })

  it('법령 검색 버튼 클릭 시 law 모드로 onChoice 호출', () => {
    const onChoice = vi.fn()

    render(
      <SearchChoiceDialog
        open={true}
        onOpenChange={vi.fn()}
        pendingQuery={mockPendingQuery}
        onChoice={onChoice}
      />
    )

    fireEvent.click(screen.getByText('법령 검색'))

    expect(onChoice).toHaveBeenCalledWith('law')
  })

  it('AI 검색 버튼 클릭 시 ai 모드로 onChoice 호출', () => {
    const onChoice = vi.fn()

    render(
      <SearchChoiceDialog
        open={true}
        onOpenChange={vi.fn()}
        pendingQuery={mockPendingQuery}
        onChoice={onChoice}
      />
    )

    fireEvent.click(screen.getByText('AI 검색'))

    expect(onChoice).toHaveBeenCalledWith('ai')
  })

  it('닫힌 상태에서 내용 숨김', () => {
    render(
      <SearchChoiceDialog
        open={false}
        onOpenChange={vi.fn()}
        pendingQuery={mockPendingQuery}
        onChoice={vi.fn()}
      />
    )

    expect(screen.queryByText('검색 방법을 선택하세요')).not.toBeInTheDocument()
  })

  it('pendingQuery가 null일 때도 렌더링', () => {
    render(
      <SearchChoiceDialog
        open={true}
        onOpenChange={vi.fn()}
        pendingQuery={null}
        onChoice={vi.fn()}
      />
    )

    expect(screen.getByText('검색 방법을 선택하세요')).toBeInTheDocument()
  })

  it('Tip 메시지 표시', () => {
    render(
      <SearchChoiceDialog
        open={true}
        onOpenChange={vi.fn()}
        pendingQuery={mockPendingQuery}
        onChoice={vi.fn()}
      />
    )

    expect(screen.getByText(/Tip:/)).toBeInTheDocument()
  })
})

describe('NoResultDialog', () => {
  const mockNoResultQuery = { lawName: '존재하지않는법령' }

  it('다이얼로그 열림 상태에서 내용 표시', () => {
    render(
      <NoResultDialog
        open={true}
        onOpenChange={vi.fn()}
        noResultQuery={mockNoResultQuery}
        onChoice={vi.fn()}
      />
    )

    expect(screen.getByText('법령을 찾을 수 없습니다')).toBeInTheDocument()
    expect(screen.getByText(/존재하지않는법령/)).toBeInTheDocument()
  })

  it('취소 버튼 클릭 시 cancel로 onChoice 호출', () => {
    const onChoice = vi.fn()

    render(
      <NoResultDialog
        open={true}
        onOpenChange={vi.fn()}
        noResultQuery={mockNoResultQuery}
        onChoice={onChoice}
      />
    )

    fireEvent.click(screen.getByText('취소'))

    expect(onChoice).toHaveBeenCalledWith('cancel')
  })

  it('AI 검색 버튼 클릭 시 ai로 onChoice 호출', () => {
    const onChoice = vi.fn()

    render(
      <NoResultDialog
        open={true}
        onOpenChange={vi.fn()}
        noResultQuery={mockNoResultQuery}
        onChoice={onChoice}
      />
    )

    fireEvent.click(screen.getByText('AI 검색'))

    expect(onChoice).toHaveBeenCalledWith('ai')
  })

  it('닫힌 상태에서 내용 숨김', () => {
    render(
      <NoResultDialog
        open={false}
        onOpenChange={vi.fn()}
        noResultQuery={mockNoResultQuery}
        onChoice={vi.fn()}
      />
    )

    expect(screen.queryByText('법령을 찾을 수 없습니다')).not.toBeInTheDocument()
  })

  it('noResultQuery가 null일 때도 렌더링', () => {
    render(
      <NoResultDialog
        open={true}
        onOpenChange={vi.fn()}
        noResultQuery={null}
        onChoice={vi.fn()}
      />
    )

    expect(screen.getByText('법령을 찾을 수 없습니다')).toBeInTheDocument()
  })

  it('오타 교정 안내 메시지 표시', () => {
    render(
      <NoResultDialog
        open={true}
        onOpenChange={vi.fn()}
        noResultQuery={mockNoResultQuery}
        onChoice={vi.fn()}
      />
    )

    expect(screen.getByText(/오타가 있거나/)).toBeInTheDocument()
  })

  it('AI 검색 Tip 메시지 표시', () => {
    render(
      <NoResultDialog
        open={true}
        onOpenChange={vi.fn()}
        noResultQuery={mockNoResultQuery}
        onChoice={vi.fn()}
      />
    )

    expect(screen.getByText(/오타를 자동으로 교정/)).toBeInTheDocument()
  })
})
