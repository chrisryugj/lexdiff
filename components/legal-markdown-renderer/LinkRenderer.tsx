import React from 'react'
import { markLawVisited } from './visited-laws'

/**
 * React children을 텍스트로 변환
 */
function getTextFromChildren(c: React.ReactNode): string {
  if (typeof c === 'string') return c
  if (typeof c === 'number') return String(c)
  if (Array.isArray(c)) return c.map(getTextFromChildren).join('')
  if (React.isValidElement(c)) {
    const props = c.props as { children?: React.ReactNode }
    if (props?.children) {
      return getTextFromChildren(props.children)
    }
  }
  return ''
}

interface LinkRendererProps {
  href?: string
  children: React.ReactNode
  onLawClick?: (lawName: string, article?: string) => void
  onAnnexClick?: (annexNumber: string, lawName: string) => void
  disabledLink?: boolean
  visitedLaws: Set<string>
  setVisitedLaws: React.Dispatch<React.SetStateAction<Set<string>>>
}

/**
 * 법령 링크 렌더러
 * - law:// 프로토콜 처리
 * - annex:// 프로토콜 처리 (별표)
 * - law.go.kr URL 처리
 * - 방문 기록 관리
 */
export function LinkRenderer({
  href,
  children,
  onLawClick,
  onAnnexClick,
  disabledLink = false,
  visitedLaws,
  setVisitedLaws
}: LinkRendererProps) {
  const handleAnyLinkClick = (e: React.MouseEvent) => {
    if (!onLawClick && !onAnnexClick) return

    e.preventDefault()
    e.stopPropagation()

    // 1. annex:// 프로토콜 (별표)
    if (href?.startsWith('annex://')) {
      if (disabledLink) return
      const path = href.replace('annex://', '')
      const parts = decodeURIComponent(path).split('/')
      const lawName = parts[0]
      const annexNumber = parts[1]

      if (onAnnexClick && lawName && annexNumber) {
        onAnnexClick(annexNumber, lawName)
      }
      return
    }

    // href에서 법령 정보 추출 시도
    let lawName: string | undefined
    let article: string | undefined

    // 2. law:// 프로토콜
    if (href?.startsWith('law://')) {
      if (disabledLink) return
      const path = href.replace('law://', '')
      const parts = path.split('/')
      lawName = decodeURIComponent(parts[0])
      article = parts[1] ? decodeURIComponent(parts[1]) : undefined
    }
    // 3. law.go.kr URL
    else if (href?.includes('law.go.kr')) {
      const match = href.match(/law\.go\.kr\/(?:법령|lsSc|자치법규)\/([^/\s?#]+)(?:\/([^/\s?#]+))?/)
      if (match) {
        lawName = decodeURIComponent(match[1])
        article = match[2] ? decodeURIComponent(match[2]) : undefined
      }
    }

    // 4. 링크 텍스트에서 법령 패턴 추출 (href가 없거나 실패했을 때 보완)
    if (!lawName) {
      const text = getTextFromChildren(children)

      // 법령 패턴 매칭
      const lawMatch = text.match(/「?([가-힣a-zA-Z0-9·\s]{2,30}(?:법|령|규칙|조례|약관))」?\s*(제\d+조(?:의\d+)?)?/)
      if (lawMatch) {
        lawName = lawMatch[1].trim()
        article = lawMatch[2] || undefined
      }
    }

    if (lawName && onLawClick) {
      // 방문 기록 저장
      const lawKey = `${lawName}|${article || ''}`
      markLawVisited(lawKey)
      setVisitedLaws(prev => new Set([...prev, lawKey]))

      onLawClick(lawName, article)
    } else {
      // 법령 정보 추출 실패 시 새 창으로 열기
      if (href && href.startsWith('http')) {
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    }
  }

  // 방문 여부 체크
  let lawKey = ''
  if (href?.startsWith('law://')) {
    const path = href.replace('law://', '')
    const parts = path.split('/')
    const ln = decodeURIComponent(parts[0])
    const art = parts[1] ? decodeURIComponent(parts[1]) : ''
    lawKey = `${ln}|${art}`
  }
  const isVisited = lawKey && visitedLaws.has(lawKey)

  // onLawClick이 있으면 모든 링크에 클릭 핸들러 적용
  if (onLawClick) {
    return (
      <a
        href={href || '#'}
        onClick={handleAnyLinkClick}
        className={`law-ref hover:underline cursor-pointer font-medium ${isVisited ? 'law-ref-visited' : ''}`}
        data-ref="law-article"
      >
        {children}
      </a>
    )
  }

  // onLawClick이 없으면 기본 동작 (새 창)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children}
    </a>
  )
}
