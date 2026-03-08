import React from 'react'
import { markLawVisited } from './visited-laws'

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

interface LinkRendererProps extends React.ComponentPropsWithoutRef<'a'> {
  onLawClick?: (lawName: string, article?: string) => void
  onAnnexClick?: (annexNumber: string, lawName: string) => void
  disabledLink?: boolean
  visitedLaws: Set<string>
  setVisitedLaws: React.Dispatch<React.SetStateAction<Set<string>>>
}

function buildLawKey(href: string | undefined, dataset: DOMStringMap): string {
  if (dataset.law) {
    return `${dataset.law}|${dataset.article || ''}`
  }

  if (href?.startsWith('law://')) {
    const path = href.replace('law://', '')
    const parts = path.split('/')
    const lawName = decodeURIComponent(parts[0] || '')
    const article = parts[1] ? decodeURIComponent(parts[1]) : ''
    return `${lawName}|${article}`
  }

  return ''
}

export function LinkRenderer({
  href,
  children,
  onLawClick,
  onAnnexClick,
  disabledLink = false,
  visitedLaws,
  setVisitedLaws,
  className,
  target,
  rel,
  onClick,
  ...anchorProps
}: LinkRendererProps) {
  const handleAnyLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return

    const dataset = e.currentTarget.dataset
    const annexLawName = dataset.law
    const annexNumber = dataset.annex

    if (disabledLink) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    if (annexNumber && onAnnexClick) {
      e.preventDefault()
      e.stopPropagation()
      if (annexLawName) {
        onAnnexClick(annexNumber, annexLawName)
      }
      return
    }

    let lawName = dataset.law
    let article = dataset.article

    if (!lawName && href?.startsWith('annex://')) {
      e.preventDefault()
      e.stopPropagation()
      const path = href.replace('annex://', '')
      const parts = decodeURIComponent(path).split('/')
      const fallbackLawName = parts[0]
      const fallbackAnnex = parts[1]

      if (onAnnexClick && fallbackLawName && fallbackAnnex) {
        onAnnexClick(fallbackAnnex, fallbackLawName)
      }
      return
    }

    if (!lawName && href?.startsWith('law://')) {
      const path = href.replace('law://', '')
      const parts = path.split('/')
      lawName = decodeURIComponent(parts[0] || '')
      article = parts[1] ? decodeURIComponent(parts[1]) : undefined
    } else if (!lawName && href?.includes('law.go.kr')) {
      const match = href.match(/law\.go\.kr\/(?:법령|lsSc|자치법규)\/([^/\s?#]+)(?:\/([^/\s?#]+))?/)
      if (match) {
        lawName = decodeURIComponent(match[1])
        article = match[2] ? decodeURIComponent(match[2]) : undefined
      }
    }

    if (!lawName) {
      const text = getTextFromChildren(children)
      const lawMatch = text.match(/「([가-힣a-zA-Z0-9·\s]{2,30}(?:법|규칙|조례|시행령|시행규칙))」\s*((?:제\s*\d+\s*조(?:의\s*\d+)?)?)?/)
      if (lawMatch) {
        lawName = lawMatch[1].trim()
        article = lawMatch[2] || undefined
      }
    }

    if (lawName && onLawClick) {
      e.preventDefault()
      e.stopPropagation()
      const lawKey = `${lawName}|${article || ''}`
      markLawVisited(lawKey)
      setVisitedLaws(prev => new Set([...prev, lawKey]))
      onLawClick(lawName, article)
      return
    }

    if (href && href.startsWith('http')) {
      e.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }

  const dataLaw = String((anchorProps as Record<string, unknown>)['data-law'] || '')
  const dataArticle = String((anchorProps as Record<string, unknown>)['data-article'] || '')
  const lawKey = buildLawKey(href, {
    law: dataLaw,
    article: dataArticle,
  } as DOMStringMap)
  const isVisited = lawKey && visitedLaws.has(lawKey)

  const mergedClassName = [
    className,
    (onLawClick || onAnnexClick) ? 'law-ref hover:underline cursor-pointer font-medium' : 'text-primary hover:underline',
    isVisited ? 'law-ref-visited' : '',
  ].filter(Boolean).join(' ')

  if (onLawClick || onAnnexClick) {
    return (
      <a
        {...anchorProps}
        href={href || '#'}
        onClick={handleAnyLinkClick}
        className={mergedClassName}
        target={target}
        rel={rel}
      >
        {children}
      </a>
    )
  }

  return (
    <a
      {...anchorProps}
      href={href}
      target={target || '_blank'}
      rel={rel || 'noopener noreferrer'}
      className={mergedClassName}
    >
      {children}
    </a>
  )
}
