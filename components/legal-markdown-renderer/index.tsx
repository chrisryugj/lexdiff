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
import sanitizeHtml from 'sanitize-html'
import { linkifyMarkdownLegalRefs } from '@/lib/unified-link-generator'
// 분리된 컴포넌트들
import { getVisitedLaws } from './visited-laws'
import { SimpleFlowchartRenderer } from './SimpleFlowchartRenderer'
import { BlockquoteRenderer } from './BlockquoteRenderer'
import { LinkRenderer } from './LinkRenderer'
import { TableRenderer, TheadRenderer, ThRenderer, TdRenderer } from './TableRenderer'

const SAFE_INLINE_STYLE_PROPERTIES = new Set([
  'align-items',
  'background',
  'background-color',
  'border',
  'border-bottom',
  'border-left',
  'border-radius',
  'box-shadow',
  'color',
  'display',
  'fill',
  'flex',
  'flex-shrink',
  'font-size',
  'font-weight',
  'gap',
  'height',
  'justify-content',
  'line-height',
  'margin',
  'margin-left',
  'margin-top',
  'min-width',
  'overflow-x',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-top',
  'stroke',
  'text-indent',
  'vertical-align',
  'white-space',
  'width',
])

function sanitizeInlineStyle(style?: string): string | undefined {
  if (!style) return undefined

  const cleaned = style
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [rawProperty, ...rawValue] = rule.split(':')
      const property = rawProperty?.trim().toLowerCase()
      const value = rawValue.join(':').trim()
      if (!property || !value) return null
      if (!SAFE_INLINE_STYLE_PROPERTIES.has(property)) return null
      if (/(?:expression|javascript:|@import|url\s*\()/i.test(value)) return null
      return `${property}: ${value}`
    })
    .filter((rule): rule is string => Boolean(rule))
    .join('; ')

  return cleaned || undefined
}

function sanitizeMarkdownHtml(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: [
      'a', 'blockquote', 'br', 'code', 'div', 'em', 'h2', 'h3', 'hr',
      'li', 'ol', 'p', 'path', 'polyline', 'line', 'rect', 'circle',
      'pre', 'span', 'strong', 'svg', 'table', 'tbody', 'td', 'th',
      'thead', 'tr', 'ul',
    ],
    allowedAttributes: {
      '*': [
        'aria-label',
        'class',
        'style',
        'data-ref',
        'data-law',
        'data-article',
        'data-law-type',
        'data-old-law',
        'data-kind',
        'data-annex',
        'data-case-number',
        'data-court',
        'data-date',
        'data-efyd',
      ],
      a: ['href', 'target', 'rel', 'title'],
      svg: ['viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'xmlns'],
      path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
      polyline: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
      line: ['x1', 'x2', 'y1', 'y2', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
      circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'law', 'annex'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto', 'law', 'annex'],
    },
    allowedSchemesAppliedToAttributes: ['href'],
    transformTags: {
      '*': (tagName, attribs) => {
        const nextAttribs = { ...attribs }
        const safeStyle = sanitizeInlineStyle(nextAttribs.style)

        if (safeStyle) {
          nextAttribs.style = safeStyle
        } else {
          delete nextAttribs.style
        }

        if (tagName === 'a') {
          if (nextAttribs.href && /^javascript:/i.test(nextAttribs.href)) {
            nextAttribs.href = '#'
          }

          if (nextAttribs.target === '_blank' && !nextAttribs.rel) {
            nextAttribs.rel = 'noopener noreferrer'
          }
        }

        return { tagName, attribs: nextAttribs }
      }
    }
  })
}

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
      // AI가 [별표]/[별지]만 들어있는 코드 펜스를 실수로 출력하는 경우 → 펜스 해제
      // (bullet 라인이 쪼개져 조문제목이 소실되는 부작용까지 함께 차단)
      .replace(/```[a-zA-Z]*\s*\n\s*(\[별[표지][^\n\]]{0,30}\])\s*\n```/g, '$1')
      // 인라인 백틱으로 감싼 [별표] → 해제 (링크 변환 대상이 되도록)
      .replace(/`(\[별[표지][^\n`\]]{0,30}\])`/g, '$1')
  }, [content])

  // 2. Generate Linkified Content
  const linkedContent = useMemo(() => {
    if (!cleanedContent) return ''
    if (disabledLink) return cleanedContent
    const linked = linkifyMarkdownLegalRefs(cleanedContent)
    // 별표 링크 주변에 고립되어 남은 따옴표/인용부호 제거
    // 예: 'ORIG `'별표'` → 링크 후 `'[별표](annex://...)'` → 양쪽 인용부호 제거
    return linked.replace(
      /(['"\u2018\u2019\u201C\u201D])?(\[별[표지][^\]]*\]\(annex:\/\/[^)]+\))(['"\u2018\u2019\u201C\u201D])?/g,
      (_m, open, link, close) => {
        const pair = (open && close) || (!open && close) || (open && !close)
        return pair ? link : (open || '') + link + (close || '')
      }
    )
  }, [cleanedContent, disabledLink])

  const sanitizedContent = useMemo(() => {
    if (!linkedContent) return ''
    return sanitizeMarkdownHtml(linkedContent)
  }, [linkedContent])


  return (
    <div className={`legal-markdown-content prose-sm dark:prose-invert max-w-full w-full overflow-x-auto [overflow-wrap:anywhere] [word-break:break-word] ${className}`}>
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
        remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => {
          if (url?.startsWith('law://')) return url
          if (url?.startsWith('annex://')) return url
          return defaultUrlTransform(url)
        }}
        components={{
          // 링크 처리
          a: ({ node, href, children, ...props }) => (
            <LinkRenderer
              href={href}
              {...props}
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

          // 헤더 스타일링
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-3 mb-2 pb-2 border-b border-border text-foreground min-w-0 break-words">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold mt-4 mb-2 text-foreground/90 min-w-0 break-words">
              {children}
            </h3>
          ),

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
        {sanitizedContent}
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
