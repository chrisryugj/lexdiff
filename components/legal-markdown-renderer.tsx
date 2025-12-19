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
import rehypeRaw from 'rehype-raw'
import { linkifyMarkdownLegalRefs } from '@/lib/unified-link-generator'
import { Icon, type IconName } from '@/components/ui/icon'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Simple Flowchart Renderer (Mini-Mermaid)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SimpleFlowchartRenderer({ code }: { code: string }) {
  // Parse format: A[Label] --> B[Label]
  // or A --> B
  const steps: { id: string, label: string }[] = []
  const edges: { from: string, to: string }[] = []

  // Very naive parser for simple linear flows (sufficient for most legal procedures)
  const lines = code.split('\n')

  // 1. Extract Nodes and Edges from lines
  lines.forEach(line => {
    // Match A[Label] --> B[Label]
    // Regex to capture nodes: ([A-Za-z0-9_]+)(?:\[(.*?)\])?
    const nodeRegex = /([A-Za-z0-9_]+)(?:\[(.*?)\])?/g

    // Split by arrow
    if (line.includes('-->')) {
      const parts = line.split('-->')
      let prevId: string | null = null

      parts.forEach(part => {
        const match = /([A-Za-z0-9_]+)(?:\[(.*?)\])?/.exec(part.trim())
        if (match) {
          const id = match[1]
          const label = match[2] || id

          // Add node if unique
          if (!steps.find(s => s.id === id)) {
            steps.push({ id, label })
          }

          if (prevId) {
            edges.push({ from: prevId, to: id })
          }
          prevId = id
        }
      })
    }
  })

  if (steps.length === 0) {
    // Fallback: If parsing fails, just show text blocks if possible, or nothing
    return (
      <div className="bg-muted/30 p-4 rounded-md my-4 border border-border/50">
        <p className="text-xs text-muted-foreground mb-2 font-mono">다이어그램 (텍스트 모드)</p>
        <pre className="text-xs">{code}</pre>
      </div>
    )
  }

  // Render as a horizontal Flex row (Linear flow assumption)
  return (
    <div className="flex flex-wrap items-center gap-2 my-6 p-4 bg-muted/10 border border-border/50 rounded-lg overflow-x-auto justify-center">
      {steps.map((step, idx) => (
        <React.Fragment key={step.id}>
          {/* Node */}
          <div className="flex flex-col items-center gap-2 min-w-[100px]">
            <div className="bg-white dark:bg-card border border-blue-200 dark:border-blue-900 shadow-sm px-4 py-3 rounded-xl flex items-center justify-center text-center">
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-100 break-keep leading-tight">
                {step.label.replace(/["']/g, '')}
              </span>
            </div>
          </div>

          {/* Arrow (if not last) */}
          {idx < steps.length - 1 && (
            <div className="text-muted-foreground/40 flex-shrink-0">
              <Icon name="arrow-right" className="w-5 h-5" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 섹션 헤더 아이콘 매핑
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 단색으로 통일 - 다크/라이트 테마 모두 대응
const SECTION_ICON_COLOR = 'text-foreground/70'

const SECTION_ICON_MAP: Array<{ pattern: RegExp; icon: IconName }> = [
  // 공통 섹션
  { pattern: /^(정의|쉬운\s*3줄\s*요약)/, icon: 'book-open' },
  { pattern: /^(법적\s*성질|상세\s*해설)/, icon: 'scale' },
  { pattern: /^조문\s*원문/, icon: 'file-text' },
  { pattern: /^조문\s*인용\s*원칙/, icon: 'book-open' },
  { pattern: /^핵심\s*해석/, icon: 'lightbulb' },
  { pattern: /^구성\s*요건/, icon: 'list-checks' },
  { pattern: /^(유사\s*개념|헷갈리는\s*개념)/, icon: 'git-compare' },
  { pattern: /^(예시|이해를\s*돕는\s*예시)/, icon: 'lightbulb' },
  { pattern: /^관계\s*법령/, icon: 'book-open' },

  // requirement (요건) 섹션
  { pattern: /^(결론|핵심\s*결론)/, icon: 'check-circle-2' },
  { pattern: /^요건\s*체크\s*순서/, icon: 'list-ordered' },
  { pattern: /^0단계|결격사유\s*먼저/, icon: 'x-circle' },
  { pattern: /^1단계|절대적\s*요건/, icon: 'check-circle' },
  { pattern: /^2단계|상대적\s*요건/, icon: 'star' },
  { pattern: /^[3-9]단계|\d{2,}단계/, icon: 'chevron-right' }, // 3단계 이상 범용 아이콘
  { pattern: /^적극적\s*요건/, icon: 'check-circle' },
  { pattern: /^소극적\s*요건/, icon: 'x-circle' },
  { pattern: /^(서류|필수\s*요건\s*체크리스트)/, icon: 'list-checks' },
  { pattern: /^(예외|특례|혹시\s*여기에\s*해당)/, icon: 'alert-triangle' },
  { pattern: /^(주의사항|코디네이터의\s*팁)/, icon: 'alert-circle' },

  // procedure (절차) 섹션
  { pattern: /^(전체\s*흐름|전체\s*로드맵)/, icon: 'list-ordered' },
  { pattern: /^(단계별\s*안내|단계별\s*상세\s*가이드)/, icon: 'list-ordered' },
  { pattern: /^기한\s*요약표?/, icon: 'clock' },
  { pattern: /^기한\s*계산\s*\(.*?\)/, icon: 'calendar' },
  { pattern: /^기한\s*계산\s*체크리스트/, icon: 'list-checks' },
  { pattern: /^(불복|구제|반려\s*주의사항)/, icon: 'shield-check' },

  // comparison (비교) 섹션
  { pattern: /^(핵심\s*차이|3줄\s*비교\s*요약)/, icon: 'git-compare' },
  { pattern: /^(상세\s*비교|어떤\s*걸\s*선택)/, icon: 'help-circle' },
  { pattern: /^(A의\s*특징|B의\s*특징|컨설턴트의\s*조언)/, icon: 'lightbulb' },
  { pattern: /^선택\s*가이드/, icon: 'check-circle-2' },
  { pattern: /^실무\s*팁/, icon: 'lightbulb' },

  // application (적용) 섹션
  { pattern: /^(요건별\s*검토|요건\s*정밀\s*검토)/, icon: 'clipboard-check' },
  { pattern: /^요건\s*충족\s*요약/, icon: 'clipboard-check' },
  { pattern: /^확신도\s*판단\s*기준표/, icon: 'list-checks' },
  { pattern: /^(추가\s*확인|만약\s*세모)/, icon: 'help-circle' },
  { pattern: /^(다음\s*행동|유사\s*판례)/, icon: 'gavel' },
  { pattern: /^판정\s*결과/, icon: 'gavel' },

  // consequence (효과) 섹션
  { pattern: /^(행정적|핵심\s*결과|예상되는\s*조치)/, icon: 'alert-triangle' },
  { pattern: /^민사적\s*효과/, icon: 'scale' },
  { pattern: /^형사적\s*효과/, icon: 'gavel' },
  { pattern: /^(효과\s*요약|상세\s*불이익)/, icon: 'alert-triangle' },
  { pattern: /^(구제|치유)/, icon: 'shield-check' },

  // scope (범위/금액) 섹션
  { pattern: /^(법정\s*기준|계산\s*결과)/, icon: 'calculator' },
  { pattern: /^(산정\s*방법|시뮬레이션)/, icon: 'chart-line' },
  { pattern: /^(가산|감경)/, icon: 'trending-up' },
  { pattern: /^계산\s*예시/, icon: 'list-ordered' },
  { pattern: /^기한\s*계산/, icon: 'calendar' },
  { pattern: /^실무\s*참고/, icon: 'bookmark' },

  // exemption (면제) 섹션
  { pattern: /^(원칙|혜택\s*적용\s*가능성)/, icon: 'award' },
  { pattern: /^(면제|감면\s*요건\s*체크)/, icon: 'list-checks' },
  { pattern: /^면제\s*\/\s*감면\s*범위/, icon: 'coins' },
  { pattern: /^(신청\s*절차|혜택\s*받는\s*방법)/, icon: 'file-text' },
  { pattern: /^(사후관리|보호관의\s*조언)/, icon: 'shield-check' },
  { pattern: /^유사\s*면제제도/, icon: 'git-compare' },
]

function getSectionIcon(text: string): { iconName: IconName; color: string } | null {
  const trimmed = text.trim()
  for (const { pattern, icon } of SECTION_ICON_MAP) {
    if (pattern.test(trimmed)) {
      return { iconName: icon, color: SECTION_ICON_COLOR }
    }
  }
  return null
}

// 방문한 법령 링크 저장 키
const VISITED_LAWS_KEY = 'lexdiff-visited-laws'

// 방문한 법령 링크 관리
function getVisitedLaws(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(VISITED_LAWS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function markLawVisited(lawKey: string) {
  if (typeof window === 'undefined') return
  try {
    const visited = getVisitedLaws()
    visited.add(lawKey)
    // 최대 500개까지만 저장
    const arr = Array.from(visited).slice(-500)
    localStorage.setItem(VISITED_LAWS_KEY, JSON.stringify(arr))
  } catch {
    // localStorage 에러 무시
  }
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
  }, [content])

  // 2. Generate Linkified Content
  const linkedContent = useMemo(() => {
    if (!cleanedContent) return ''
    if (disabledLink) return cleanedContent
    return linkifyMarkdownLegalRefs(cleanedContent)
  }, [cleanedContent, disabledLink])


  return (
    <div className={`legal-markdown-content prose dark:prose-invert max-w-none ${className}`}>
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
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => {
          // react-markdown 기본 sanitizer가 커스텀 스킴을 제거해서 href가 ''가 될 수 있음.
          // 조문 모달용 커스텀 스킴(law://)은 허용하고, 그 외는 기본 변환 규칙을 그대로 사용.
          if (url?.startsWith('law://')) return url
          return defaultUrlTransform(url)
        }}
        components={{
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 링크 처리 (법령 링크 vs 법제처 URL vs 일반 링크)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          a: ({ href, children, node }) => {
            // 모든 링크 클릭 → onLawClick이 있으면 무조건 모달로 처리
            const handleAnyLinkClick = (e: React.MouseEvent) => {
              if (!onLawClick && !onAnnexClick) return // 핸들러 없으면 기본 동작

              e.preventDefault()
              e.stopPropagation()

              console.log('[LegalMarkdown] Link click:', { href })

              // 1. annex:// 프로토콜 (별표)
              if (href?.startsWith('annex://')) {
                if (disabledLink) return
                const path = href.replace('annex://', '')
                const parts = decodeURIComponent(path).split('/')
                const lawName = parts[0]
                const annexNumber = parts[1]

                console.log('[LegalMarkdown] Annex link click:', { lawName, annexNumber })

                if (onAnnexClick && lawName && annexNumber) {
                  onAnnexClick(annexNumber, lawName)
                } else {
                  console.warn('[LegalMarkdown] onAnnexClick not provided or invalid data')
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
                // React children을 텍스트로 변환
                const getTextFromChildren = (c: React.ReactNode): string => {
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
                // 법령 정보 추출 실패 시 새 창으로 열기 (href가 유효할 때만)
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
          },

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 인용 블록 (조문 인용)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          blockquote: ({ children }) => {
            // 텍스트 추출 헬퍼 (줄바꿈 보존을 위해 join('\n') 사용)
            const getText = (node: React.ReactNode): string => {
              if (typeof node === 'string') return node
              if (typeof node === 'number') return String(node)
              // 블록 요소의 형제들이면 줄바꿈으로 연결
              if (Array.isArray(node)) return node.map(getText).join('\n')

              if (React.isValidElement(node)) {
                const props = node.props as { children?: React.ReactNode }
                if (props?.children) {
                  // Element 내부(P 태그 안)는 인라인이므로 재귀 호출 시 join('') 사용해야 함.
                  // 하지만 여기서는 편의상 getText를 그대로 사용하되, 
                  // P 태그 내부의 children이 배열일 경우(Text + Link + Text)에도 \n이 들어가버릴 수 있음.
                  // 이를 방지하기 위해 내부용 함수 분리.
                  return getTextInner(props.children)
                }
              }
              return ''
            }

            const getTextInner = (node: React.ReactNode): string => {
              if (typeof node === 'string') return node
              if (typeof node === 'number') return String(node)
              if (Array.isArray(node)) return node.map(getTextInner).join('') // 인라인은 붙임
              if (React.isValidElement(node)) {
                const props = node.props as { children?: React.ReactNode }
                if (props?.children) return getTextInner(props.children)
              }
              return ''
            }

            // 노드 트리 분할 헬퍼 (Clone with Key)
            const splitNodes = (nodes: React.ReactNode[], splitIndex: number): [React.ReactNode[], React.ReactNode[]] => {
              let currentLength = 0
              const left: React.ReactNode[] = []
              const right: React.ReactNode[] = []
              let splitFound = false

              React.Children.forEach(nodes, (node, index) => {
                if (splitFound) {
                  right.push(node)
                  return
                }

                const nodeText = getTextInner(node)
                const nodeLength = nodeText.length

                if (currentLength + nodeLength <= splitIndex) {
                  // 노드가 완전히 Split 지점 이전에 있음
                  left.push(node)
                  currentLength += nodeLength
                } else {
                  // Split 지점이 이 노드 내부에 있음 -> 노드 쪼개기
                  splitFound = true
                  const localSplitIndex = splitIndex - currentLength

                  if (typeof node === 'string') {
                    left.push(node.substring(0, localSplitIndex))
                    right.push(node.substring(localSplitIndex))
                  } else if (React.isValidElement(node)) {
                    // 재귀적으로 자식 노드 분할
                    const props = node.props as { children?: React.ReactNode }
                    const childNodes = React.Children.toArray(props.children)
                    const [childLeft, childRight] = splitNodes(childNodes, localSplitIndex)

                    // Key preservation strategy (node.key 사용 - props.key는 React 특수 prop으로 접근 불가)
                    const baseKey = node.key || `split-${index}`

                    if (childLeft.length > 0) {
                      left.push(React.cloneElement(node, {
                        ...props,
                        key: `${baseKey}-left`,
                        children: childLeft
                      } as React.Attributes & { children?: React.ReactNode }))
                    }
                    if (childRight.length > 0) {
                      right.push(React.cloneElement(node, {
                        ...props,
                        key: `${baseKey}-right`,
                        children: childRight
                      } as React.Attributes & { children?: React.ReactNode }))
                    }
                  } else {
                    left.push(node)
                  }
                  currentLength += nodeLength
                }
              })

              return [left, right]
            }

            const childrenArray = React.Children.toArray(children)
            const fullText = getText(childrenArray).trim()

            // 법령 조문 패턴: "법령명 제N조 (제목) 본문" 형태 파싱
            // 정규식 개선 for Robust Capture (닫는 괄호 포함 보장)
            // (.+?(?:조|항|호)(?:의\d+)?(?:\s*\(.*?\))?) -> Non-greedy start + valid suffix + optional parens
            const match = fullText.match(/^(.+?(?:조|항|호)(?:의\d+)?(?:\s*\(.*?\))?)([\s\n]+)([\s\S]+)$/)

            if (match) {
              const titleText = match[1]
              const separatorText = match[2]

              const titleEndIndex = fullText.indexOf(titleText) + titleText.length
              const separatorLength = separatorText.length

              // 1차 분할: Title vs (Separator + Content)
              const [titleNodes, restNodes] = splitNodes(childrenArray, titleEndIndex)

              // 2차 분할: Separator vs Content
              const [, contentNodes] = splitNodes(restNodes, separatorLength)

              // 조문 제목에서 괄호 ( ) 제거 (User Request: "조문 제목 앞 ( 도 없애서 일관성있게")
              // 재귀적으로 텍스트 노드 탐색하여 제거
              const removeParentheses = (nodes: React.ReactNode[]): React.ReactNode[] => {
                return nodes.map((node, i) => {
                  if (typeof node === 'string') {
                    // 괄호 제거
                    return node.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
                  }
                  if (React.isValidElement(node)) {
                    const props = node.props as { children?: React.ReactNode; key?: React.Key }
                    const newChildren = props.children ? removeParentheses(React.Children.toArray(props.children)) : undefined
                    return React.cloneElement(node, {
                      ...props,
                      children: newChildren
                    } as any)
                  }
                  return node
                })
              }

              const cleanTitleNodes = removeParentheses(titleNodes)

              // [부분 인용] 감지 (띄어쓰기/괄호 유무 모두 허용)
              const isPartialQuote = /\[?\s*부분\s*인용\s*\]?/i.test(fullText)
              // [...] 감지 (이하 생략)
              const isOmitted = fullText.includes('[...]') || fullText.includes('[…]')

              // 제목에서 [부분 인용] 텍스트 제거 (배지로 대체) - 괄호/띄어쓰기 유무 모두 제거
              const removePartialQuoteText = (nodes: React.ReactNode[]): React.ReactNode[] => {
                return nodes.map((node) => {
                  if (typeof node === 'string') {
                    // 괄호 있음: [부분 인용], [부분인용]
                    // 괄호 없음: 부분 인용, 부분인용
                    return node.replace(/\s*\[?\s*부분\s*인용\s*\]?\s*/gi, ' ').trim()
                  }
                  if (React.isValidElement(node)) {
                    const props = node.props as { children?: React.ReactNode }
                    const newChildren = props.children ? removePartialQuoteText(React.Children.toArray(props.children)) : undefined
                    return React.cloneElement(node, {
                      ...props,
                      children: newChildren
                    } as any)
                  }
                  return node
                })
              }

              // 본문에서 [...] 를 인라인 배지로 대체
              const replaceOmittedWithBadge = (nodes: React.ReactNode[]): React.ReactNode[] => {
                return nodes.flatMap((node, idx) => {
                  if (typeof node === 'string') {
                    // [...] 또는 […] 패턴을 배지로 대체
                    const parts = node.split(/(\[\.{3}\]|\[…\])/)
                    return parts.map((part, i) => {
                      if (part === '[...]' || part === '[…]') {
                        return (
                          <span
                            key={`omit-${idx}-${i}`}
                            className="inline-flex items-center mx-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30 rounded cursor-help align-middle"
                            title="이하 내용이 생략되었습니다. 링크를 통해 전문을 확인하세요."
                          >
                            이하 생략
                          </span>
                        )
                      }
                      return part
                    })
                  }
                  if (React.isValidElement(node)) {
                    const props = node.props as { children?: React.ReactNode }
                    const newChildren = props.children ? replaceOmittedWithBadge(React.Children.toArray(props.children)) : undefined
                    return React.cloneElement(node, {
                      ...props,
                      children: newChildren
                    } as any)
                  }
                  return node
                })
              }

              const finalTitleNodes = isPartialQuote ? removePartialQuoteText(cleanTitleNodes) : cleanTitleNodes
              // 본문에서 [부분 인용] 제거 + [...] 배지 대체
              let processedContentNodes = isPartialQuote ? removePartialQuoteText(contentNodes) : contentNodes
              const finalContentNodes = isOmitted ? replaceOmittedWithBadge(processedContentNodes) : processedContentNodes

              return (
                <blockquote className="border-l-4 border-primary/40 bg-muted/30 pl-3 !pr-4 py-0.5 my-2 rounded-r-md !ml-3 !mr-3 not-italic overflow-visible">
                  <div className="flex flex-col gap-0 [&_p]:my-0 [&_p]:leading-relaxed">
                    {/* 조문 제목 Group */}
                    <div className="text-[#a0a0a0] font-normal text-sm break-words flex items-center gap-1.5 flex-wrap [&_strong]:font-normal [&_b]:font-normal">
                      {finalTitleNodes}
                      {isPartialQuote && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded cursor-help"
                          title="부분 인용된 조문입니다. 링크를 통해 전문을 확인하세요."
                        >
                          부분 인용
                        </span>
                      )}
                    </div>
                    {/* 조문 본문 Group */}
                    <div className="text-foreground dark:text-white text-sm leading-relaxed mt-0.5">
                      {finalContentNodes}
                    </div>
                  </div>
                </blockquote>
              )
            }

            // 기본 렌더링 (ml-0 강제 적용, Compact)
            return (
              <blockquote className="border-l-4 border-primary/40 bg-muted/30 pl-3 !pr-4 py-0.5 my-1 rounded-r-md !ml-0 !mr-0 not-italic overflow-visible [&_p]:my-0 [&_p:first-of-type]:text-muted-foreground [&_p:first-of-type]:mb-1 [&_p:not(:first-of-type)]:text-foreground dark:[&_p:not(:first-of-type)]:text-white">
                <div className="leading-relaxed">
                  {children}
                </div>
              </blockquote>
            )
          },

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 테이블 (반응형) - 부모 fontSize 상속
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 테이블 (반응형) - 부모 fontSize 상속
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 mx-3 rounded-md border border-border/50 bg-card/50">
              <table className="w-full border-collapse table-auto" style={{ fontSize: 'inherit' }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground">
              {children}
            </thead>
          ),
          // ✅ TH 커스텀: 짧은 컬럼(순번, 구분 등)은 최소 너비, 나머지는 균등 분할 효과
          th: ({ children, ...props }) => {
            // 짧은 컬럼으로 취급할 헤더 키워드
            const SHORT_COLUMN_KEYWORDS = [
              '순번', 'no', 'no.', '#', '번호',
              '구분', '분류', '유형', '종류',
              '단계', 'step',
              '항목', '비고', '선택', '결과',
              '날짜', '일시',
              '✅', '❌'
            ]

            // 텍스트 내용 확인 (Children이 문자열인 경우)
            const textContent = typeof children === 'string'
              ? children.toLowerCase().trim()
              : Array.isArray(children) && typeof children[0] === 'string'
                ? children[0].toLowerCase().trim()
                : ''

            const isShortColumn = SHORT_COLUMN_KEYWORDS.some(k => textContent === k || textContent.includes(k))

            return (
              <th
                className={`
                        px-4 py-2.5 text-left font-semibold text-foreground/80 align-middle
                        ${isShortColumn
                    ? 'w-[1%] whitespace-nowrap text-center'
                    : 'min-w-[120px]' // 나머지는 최소 너비 보장 -> 브라우저가 자동 분할
                  }
                    `}
                style={{ fontSize: 'inherit' }}
                {...props}
              >
                {children}
              </th>
            )
          },
          td: ({ children }) => (
            <td className="px-4 py-2.5 border-b border-border/50 text-foreground/90 align-top leading-relaxed break-keep" style={{ fontSize: 'inherit' }}>
              {children}
            </td>
          ),

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 헤더 스타일링 (섹션 아이콘 포함)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 코드 블록 및 인라인 코드
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '')
            const codeContent = String(children).replace(/\n$/, '')

            // Auto-detect Mermaid even if language tag is missing or wrong
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
          pre: ({ children }) => <>{children}</>, // pre는 code에서 처리함
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
