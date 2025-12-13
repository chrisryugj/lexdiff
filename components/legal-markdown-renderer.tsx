'use client'

/**
 * 법률 Markdown 렌더러 (Legal Markdown Renderer)
 *
 * react-markdown 기반으로 AI 답변을 렌더링
 * - 법령 링크 자동 생성 (「법령명」 제N조)
 * - 조문 인용 blockquote 스타일링
 * - 테이블 반응형 처리
 */

import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { linkifyMarkdownLegalRefs } from '@/lib/unified-link-generator'

interface LegalMarkdownRendererProps {
  content: string
  onLawClick?: (lawName: string, article?: string) => void
  className?: string
}

/**
 * 법령 링크 컴포넌트
 */
function LawLink({
  href,
  children,
  onLawClick
}: {
  href: string
  children: React.ReactNode
  onLawClick?: (lawName: string, article?: string) => void
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()

    // law://법령명/제N조 형식에서 파싱
    if (href.startsWith('law://')) {
      const path = href.replace('law://', '')
      const parts = path.split('/')
      const lawName = decodeURIComponent(parts[0])
      const article = parts[1] ? decodeURIComponent(parts[1]) : undefined

      if (onLawClick) {
        onLawClick(lawName, article)
      }
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className="law-ref text-primary hover:underline cursor-pointer font-medium"
      data-ref="law-article"
    >
      {children}
    </a>
  )
}

/**
 * 메인 렌더러 컴포넌트
 */
export function LegalMarkdownRenderer({
  content,
  onLawClick,
  className = ''
}: LegalMarkdownRendererProps) {
  // 1. 법령 링크 전처리 (「법령명」 제N조 → Markdown 링크)
  const linkedContent = useMemo(() => {
    if (!content) return ''
    return linkifyMarkdownLegalRefs(content)
  }, [content])

  return (
    <div className={`legal-markdown-content prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 링크 처리 (법령 링크 vs 법제처 URL vs 일반 링크)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          a: ({ href, children, node }) => {
            // 모든 링크 클릭 → onLawClick이 있으면 무조건 모달로 처리
            const handleAnyLinkClick = (e: React.MouseEvent) => {
              if (!onLawClick) return // onLawClick 없으면 기본 동작

              e.preventDefault()
              e.stopPropagation()

              // href에서 법령 정보 추출 시도
              let lawName: string | undefined
              let article: string | undefined

              // 1. law:// 프로토콜
              if (href?.startsWith('law://')) {
                const path = href.replace('law://', '')
                const parts = path.split('/')
                lawName = decodeURIComponent(parts[0])
                article = parts[1] ? decodeURIComponent(parts[1]) : undefined
              }
              // 2. law.go.kr URL
              else if (href?.includes('law.go.kr')) {
                const match = href.match(/law\.go\.kr\/(?:법령|lsSc|자치법규)\/([^/\s?#]+)(?:\/([^/\s?#]+))?/)
                if (match) {
                  lawName = decodeURIComponent(match[1])
                  article = match[2] ? decodeURIComponent(match[2]) : undefined
                }
              }

              // 3. 링크 텍스트에서 법령 패턴 추출
              if (!lawName) {
                // React children을 텍스트로 변환
                const getTextFromChildren = (c: React.ReactNode): string => {
                  if (typeof c === 'string') return c
                  if (typeof c === 'number') return String(c)
                  if (Array.isArray(c)) return c.map(getTextFromChildren).join('')
                  if (React.isValidElement(c) && c.props?.children) {
                    return getTextFromChildren(c.props.children)
                  }
                  return ''
                }
                const text = getTextFromChildren(children)

                // 법령 패턴 매칭
                const lawMatch = text.match(/「?([가-힣a-zA-Z0-9·\s]{2,30}(?:법|령|규칙|조례|약관))」?\s*(제\d+조(?:의\d+)?)?/)
                if (lawMatch) {
                  lawName = lawMatch[1].trim()
                  article = lawMatch[2] || undefined
                }
              }

              console.log('[LegalMarkdown] Link click:', { href, lawName, article })

              if (lawName) {
                onLawClick(lawName, article)
              } else {
                // 법령 정보 추출 실패 시 새 창으로 열기
                if (href && href.startsWith('http')) {
                  window.open(href, '_blank', 'noopener,noreferrer')
                }
              }
            }

            // onLawClick이 있으면 모든 링크에 클릭 핸들러 적용
            if (onLawClick) {
              return (
                <a
                  href={href || '#'}
                  onClick={handleAnyLinkClick}
                  className="law-ref text-primary hover:underline cursor-pointer font-medium"
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
          },

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 인용 블록 (조문 인용)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/40 bg-muted/30 pl-4 pr-3 py-3 my-4 rounded-r-md not-italic">
              <div className="text-sm leading-relaxed text-foreground/90">
                {children}
              </div>
            </blockquote>
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 테이블 (반응형)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 -mx-1">
              <table className="min-w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 border-b border-border">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-foreground/80 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border/50">
              {children}
            </td>
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 헤더 스타일링
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-6 mb-3 pb-2 border-b border-border text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold mt-4 mb-2 text-foreground/90">
              {children}
            </h3>
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 리스트 스타일링
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-5 my-2 space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-5 my-2 space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed">
              {children}
            </li>
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 문단 스타일링
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          p: ({ children }) => (
            <p className="text-sm leading-relaxed my-2">
              {children}
            </p>
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 강조 스타일링
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 수평선
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          hr: () => (
            <hr className="my-4 border-border/50" />
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 코드 (인라인)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          code: ({ children }) => (
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ),
        }}
      >
        {linkedContent}
      </ReactMarkdown>
    </div>
  )
}

/**
 * 스트리밍 렌더러 (SSE용)
 * 부분적으로 도착하는 Markdown을 실시간 렌더링
 */
export function StreamingLegalMarkdownRenderer({
  content,
  isStreaming = false,
  onLawClick,
  className = ''
}: LegalMarkdownRendererProps & { isStreaming?: boolean }) {
  return (
    <div className="relative">
      <LegalMarkdownRenderer
        content={content}
        onLawClick={onLawClick}
        className={className}
      />

      {/* 스트리밍 중 커서 표시 */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5" />
      )}
    </div>
  )
}
