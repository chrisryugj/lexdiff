'use client'

/**
 * 법률 Markdown 렌더러 (Legal Markdown Renderer)
 *
 * react-markdown 기반으로 AI 답변을 렌더링
 * - 법령 링크 자동 생성 (「법령명」 제N조)
 * - 조문 인용 blockquote 스타일링
 * - 테이블 반응형 처리
 */

import React, { useMemo, useEffect, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import { linkifyMarkdownLegalRefs } from '@/lib/unified-link-generator'
import { Icon } from '@/components/ui/icon'

// 분리된 컴포넌트들
import { getSectionIcon } from './section-icons'
import { getVisitedLaws } from './visited-laws'
import { SimpleFlowchartRenderer } from './SimpleFlowchartRenderer'
import { BlockquoteRenderer } from './BlockquoteRenderer'
import { LinkRenderer } from './LinkRenderer'
import { TableRenderer, TheadRenderer, ThRenderer, TdRenderer } from './TableRenderer'

interface LegalMarkdownRendererProps {
  content: string
  onLawClick?: (lawName: string, article?: string) => void
  onAnnexClick?: (annexNumber: string, lawName: string) => void
  disabledLink?: boolean
  className?: string
}

/**
 * 메인 렌더러 컴포넌트
 */
export function LegalMarkdownRenderer({
  content,
  onLawClick,
  onAnnexClick,
  disabledLink = false,
  className = ''
}: LegalMarkdownRendererProps) {

  // 방문한 링크 상태 (클라이언트에서만)
  const [visitedLaws, setVisitedLaws] = useState<Set<string>>(new Set())

  // 컴포넌트 마운트 시 localStorage에서 방문 기록 로드
  useEffect(() => {
    setVisitedLaws(getVisitedLaws())
  }, [])

  // 1. Remove "Mermaid fallback" text pattern (clean up AI output)
  const cleanedContent = useMemo(() => {
    return content
      .replace(/\(Mermaid 미지원 시 텍스트 화살표로 대체:.*?\)/g, '')
      .replace(/\(Mermaid 미지원 시.*?\)/g, '')
  }, [content])

  // 2. Generate Linkified Content
  const linkedContent = useMemo(() => {
    if (!cleanedContent) return ''
    if (disabledLink) return cleanedContent
    return linkifyMarkdownLegalRefs(cleanedContent)
  }, [cleanedContent, disabledLink])


  return (
    <div className={`legal-markdown-content prose dark:prose-invert max-w-none overflow-x-hidden break-words ${className}`}>
      <style>{`
        .hwpx-num-item {
          font-weight: 600;
          margin: 1em 0 0.25em 0;
          font-size: inherit;
        }
        .hwpx-section {
          padding-left: 1.5em;
          margin-bottom: 0.5em;
          font-size: inherit;
        }
        .hwpx-sub-item {
          margin: 0.15em 0;
          font-size: inherit;
        }
        .hwpx-content {
          margin: 0.15em 0;
          font-size: inherit;
        }
        /* h2 섹션 내용 들여쓰기 */
        .legal-markdown-content h2 ~ p,
        .legal-markdown-content h2 ~ ul,
        .legal-markdown-content h2 ~ ol,
        .legal-markdown-content h2 ~ blockquote,
        .legal-markdown-content h2 ~ h3 {
          padding-left: 0.5rem;
        }
        /* h3 섹션 내용 들여쓰기 (h2 내용 + 추가 들여쓰기) */
        .legal-markdown-content h3 ~ p,
        .legal-markdown-content h3 ~ ul,
        .legal-markdown-content h3 ~ ol,
        .legal-markdown-content h3 ~ blockquote {
          padding-left: 1rem;
        }
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => {
          if (url?.startsWith('law://')) return url
          return defaultUrlTransform(url)
        }}
        components={{
          // 링크 처리
          a: ({ href, children }) => (
            <LinkRenderer
              href={href}
              onLawClick={onLawClick}
              onAnnexClick={onAnnexClick}
              disabledLink={disabledLink}
              visitedLaws={visitedLaws}
              setVisitedLaws={setVisitedLaws}
            >
              {children}
            </LinkRenderer>
          ),

          // 인용 블록
          blockquote: ({ children }) => (
            <BlockquoteRenderer>{children}</BlockquoteRenderer>
          ),

          // 테이블
          table: ({ children }) => <TableRenderer>{children}</TableRenderer>,
          thead: ({ children }) => <TheadRenderer>{children}</TheadRenderer>,
          th: ({ children, ...props }) => <ThRenderer {...props}>{children}</ThRenderer>,
          td: ({ children }) => <TdRenderer>{children}</TdRenderer>,

          // 헤더 스타일링 (섹션 아이콘 포함)
          h2: ({ children }) => {
            const text = typeof children === 'string' ? children :
              React.Children.toArray(children).map(c => typeof c === 'string' ? c : '').join('')
            const iconInfo = getSectionIcon(text)

            return (
              <h2 className="text-base font-bold mt-3 mb-2 pb-2 border-b border-border text-foreground flex items-center gap-2">
                {iconInfo && <Icon name={iconInfo.iconName} className={`h-4 w-4 ${iconInfo.color} shrink-0`} />}
                {children}
              </h2>
            )
          },
          h3: ({ children }) => {
            const text = typeof children === 'string' ? children :
              React.Children.toArray(children).map(c => typeof c === 'string' ? c : '').join('')
            const iconInfo = getSectionIcon(text)

            return (
              <h3 className="text-sm font-bold mt-4 mb-2 text-foreground/90 flex items-center gap-1.5">
                {iconInfo && <Icon name={iconInfo.iconName} className={`h-3.5 w-3.5 ${iconInfo.color} shrink-0`} />}
                {children}
              </h3>
            )
          },

          // 리스트 스타일링
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

          // 문단 스타일링
          p: ({ children }) => (
            <p className="text-sm leading-relaxed my-2">
              {children}
            </p>
          ),

          // 강조 스타일링
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),

          // 수평선
          hr: () => (
            <hr className="my-4 border-border/50" />
          ),

          // 코드 블록 및 인라인 코드
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '')
            const codeContent = String(children).replace(/\n$/, '')

            // Auto-detect Mermaid
            const isMermaid = (match && match[1] === 'mermaid') ||
              codeContent.startsWith('graph ') ||
              codeContent.startsWith('flowchart ')

            if (!inline && isMermaid) {
              return <SimpleFlowchartRenderer code={codeContent} />
            }

            if (!inline) {
              return (
                <div className="relative my-4 rounded-md bg-muted/50 border border-border overflow-hidden">
                  <div className="px-3 py-1.5 bg-muted border-b border-border text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <span>{match ? match[1] : 'Code'}</span>
                  </div>
                  <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              )
            }

            return (
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-pink-600 dark:text-pink-400" {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => <>{children}</>,
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
  onAnnexClick,
  className = ''
}: LegalMarkdownRendererProps & { isStreaming?: boolean }) {
  return (
    <div className="relative">
      <LegalMarkdownRenderer
        content={content}
        onLawClick={onLawClick}
        onAnnexClick={onAnnexClick}
        className={className}
      />

      {/* 스트리밍 중 커서 표시 */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5" />
      )}
    </div>
  )
}
