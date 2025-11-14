'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, BookOpen, ExternalLink, Scale, ChevronDown, ChevronUp, ZoomIn, ZoomOut, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

// 법령 조문 접기/펼치기 상태 관리 (전역)
const lawArticleCollapseState = new Map<string, boolean>()

// 접기/펼치기 가능한 인용 블록 컴포넌트 (다크테마, 항/호 줄구분)
function CollapsibleBlockquote({
  children,
  fontSize,
  title
}: {
  children: React.ReactNode
  fontSize: number
  title?: string
}) {
  // 기본값: 접힌 상태 (title이 있으면 관련법령 섹션)
  const defaultCollapsed = !!title
  const stateKey = title || 'default'

  const [isExpanded, setIsExpanded] = useState(() => {
    if (lawArticleCollapseState.has(stateKey)) {
      return lawArticleCollapseState.get(stateKey)!
    }
    return !defaultCollapsed
  })

  const toggleExpanded = () => {
    const newState = !isExpanded
    setIsExpanded(newState)
    lawArticleCollapseState.set(stateKey, newState)
  }

  // 텍스트 길이 계산 - 재귀적으로 모든 텍스트 추출
  const extractAllText = (node: any): string => {
    if (!node) return ''
    if (typeof node === 'string') return node
    if (typeof node === 'number') return String(node)
    if (Array.isArray(node)) {
      return node.map(extractAllText).join('\n')
    }
    if (React.isValidElement(node) && node.props) {
      if (node.props.children) {
        return extractAllText(node.props.children)
      }
    }
    return ''
  }

  const textContent = extractAllText(children).trim()

  // 항/호 줄구분 처리 - 복사 시 번호 포함되도록 수정
  const renderContent = () => {
    // Extract text from React elements
    const text = extractAllText(children)

    // Split by lines and filter empty
    const lines = text.split(/\n+/).filter(line => line.trim())

    return lines.map((line, i) => (
      <div key={i} className="text-gray-200">
        {line}
      </div>
    ))
  }

  // 관련법령 섹션: 제목 클릭으로 접기/펼치기
  if (title) {
    return (
      <div className="my-1">
        <h3
          onClick={toggleExpanded}
          className="!text-sm !font-semibold !mt-2 !mb-0.5 text-cyan-300 cursor-pointer hover:text-cyan-200 transition-colors flex items-center gap-1"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
          {title}
        </h3>
        {isExpanded && (
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 rounded-full" />
            <div
              className="ml-3 bg-gray-950 py-1.5 px-3 rounded-lg space-y-0"
              style={{ fontSize: `${fontSize}px` }}
            >
              {renderContent()}
            </div>
          </div>
        )}
      </div>
    )
  }

  // 일반 blockquote (관련법령 아닌 경우)
  return (
    <div className="my-1">
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 rounded-full" />
        <div
          className="ml-3 bg-gray-950 py-1.5 px-3 rounded-lg space-y-1"
          style={{ fontSize: `${fontSize}px` }}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

interface Citation {
  lawName: string
  articleNumber: string
  chunkText: string
  uri?: string
  effectiveDate?: string  // 시행일 추가
}

interface FileSearchAnswerDisplayProps {
  query: string
  onCitationClick?: (lawName: string, articleNumber: string) => void
  onReset?: () => void
}

export function FileSearchAnswerDisplay({
  query,
  onCitationClick,
  onReset
}: FileSearchAnswerDisplayProps) {
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [fontSize, setFontSize] = useState(14) // 기본 폰트 크기
  const [copied, setCopied] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})  // ✅ 접기/펼치기 상태

  // 섹션 토글
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
  }

  // 복사 함수
  const handleCopy = async () => {
    const fullText = `질문: ${query}\n\n${answer}`
    await navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 폰트 크기 조절
  const increaseFontSize = () => {
    setFontSize(prev => Math.min(prev + 2, 20))
  }

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 2, 12))
  }

  // 질문에서 키워드 추출 (키워드 하이라이트용)
  const queryKeywords = React.useMemo(() => {
    const keywords = query
      .split(/\s+/)
      .filter(word => word.length > 1)
      .filter(word => !['의', '를', '을', '에', '에서', '가', '이', '는', '한', '와', '과', '대해', '대한'].includes(word))
    return keywords
  }, [query])

  // 텍스트에서 키워드 하이라이트
  const highlightKeywords = (text: string) => {
    if (!queryKeywords.length) return text

    let highlightedText = text
    queryKeywords.forEach(keyword => {
      const regex = new RegExp(`(${keyword})`, 'gi')
      highlightedText = highlightedText.replace(regex, '**$1**')
    })
    return highlightedText
  }

  // 관련법령 섹션 전처리: H3 제목을 CollapsibleBlockquote title로 전달
  const { processedAnswer, lawArticleTitles } = React.useMemo(() => {
    if (!answer) return { processedAnswer: '', lawArticleTitles: [] }

    // 📖 관련 법령 섹션만 찾아서 처리
    const relatedLawsPattern = /## 📖 관련 법령[\s\S]*$/
    const match = answer.match(relatedLawsPattern)

    if (!match) return { processedAnswer: answer, lawArticleTitles: [] }

    const beforeSection = answer.substring(0, match.index!)
    let relatedLawsSection = match[0]

    // H3 제목 추출 (다음 줄 괄호 병합)
    const titles: string[] = []
    const h3Pattern = /###\s+([^\n]+)/g
    let titleMatch

    while ((titleMatch = h3Pattern.exec(relatedLawsSection)) !== null) {
      let title = titleMatch[1].trim()

      // 다음 줄에 괄호로 시작하는 텍스트가 있으면 병합
      const nextLineStart = titleMatch.index + titleMatch[0].length
      const remainingText = relatedLawsSection.substring(nextLineStart)
      const nextLineMatch = remainingText.match(/^\s*(\([^)]+\))/)

      if (nextLineMatch) {
        title += ' ' + nextLineMatch[1]  // 공백 + 괄호 추가
      }

      titles.push(title)
    }

    // H3 제목 제거 (CollapsibleBlockquote가 title로 렌더링)
    relatedLawsSection = relatedLawsSection.replace(/###\s+([^\n]+)\n/g, '')

    return {
      processedAnswer: beforeSection + relatedLawsSection,
      lawArticleTitles: titles
    }
  }, [answer])

  // 커스텀 마크다운 컴포넌트 (다크테마 최적화)
  const markdownComponents: Components = React.useMemo(() => {
    let inRelatedLawsSection = false
    let relatedLawsH3Index = -1

    return {
      // H2 - 📋 핵심 요약, 📄 상세 내용, 💡 추가 참고사항, 📖 관련 법령
      h2: ({ children }) => {
        const childArray = React.Children.toArray(children)
        const text = childArray.join('')
        inRelatedLawsSection = text.includes('📖') && text.includes('관련')

        return (
          <h2 className="text-white" style={{ fontSize: '24px', fontWeight: 900, marginTop: '20px', marginBottom: '8px', letterSpacing: '-0.02em' }}>
            {children}
          </h2>
        )
      },
      // H3 - 관련법령 섹션에서는 숨김 (CollapsibleBlockquote가 렌더링)
      h3: ({ children }) => {
        if (inRelatedLawsSection) {
          return null // 관련법령 섹션의 H3는 렌더링하지 않음
        }
        return (
          <h3 className="text-cyan-300" style={{ fontSize: '16px', fontWeight: 700, marginTop: '8px', marginBottom: '2px' }}>
            {children}
          </h3>
        )
      },
      // 인용 블록 - 법령 조문용 스타일 (접기/펼치기 지원)
      blockquote: ({ children }) => {
        let title: string | undefined = undefined

        // 관련법령 섹션에서만 제목 표시 (접기/펼치기 가능)
        if (inRelatedLawsSection) {
          relatedLawsH3Index++
          if (relatedLawsH3Index < lawArticleTitles.length) {
            title = lawArticleTitles[relatedLawsH3Index]
          }
        }

        return (
          <CollapsibleBlockquote fontSize={fontSize} title={title}>
            {children}
          </CollapsibleBlockquote>
        )
      },
      // 강조 - 법령명, 조문번호, 키워드
      strong: ({ children }) => (
        <strong className="font-bold text-cyan-400">
          {children}
        </strong>
      ),
      // 이탤릭 - 다크테마
      em: ({ children }) => (
        <em className="italic text-gray-300">
          {children}
        </em>
      ),
      // 링크 - 다크테마
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 underline"
        >
          {children}
        </a>
      ),
    // 리스트 - 들여쓰기 개선
    ul: ({ children }) => (
      <ul className="ml-6 list-disc text-gray-300" style={{ fontSize: `${fontSize}px`, marginTop: '2px', marginBottom: '2px', lineHeight: '1.4' }}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="ml-6 list-decimal text-gray-300" style={{ fontSize: `${fontSize}px`, marginTop: '2px', marginBottom: '2px', lineHeight: '1.4' }}>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="text-gray-300" style={{ marginBottom: '0px' }}>
        {children}
      </li>
    ),
    // 문단
    p: ({ children }) => {
      return (
        <p className="my-0.5 text-gray-200 leading-relaxed" style={{ fontSize: `${fontSize}px` }}>
          {children}
        </p>
      )
    },
    // 코드 블록 - 접기/펼치기 지원
      code: ({ node, inline, className, children, ...props }) => {
        if (inline) {
          return <code className="px-1 py-0.5 bg-gray-700 rounded text-cyan-300 text-xs">{children}</code>
        }

        // ✅ Content-based key (re-render 시에도 유지)
        const content = String(children).trim()
        const codeKey = `code_${content.substring(0, 100).replace(/[^a-zA-Z0-9가-힣]/g, '_')}`
        const isExpanded = expandedSections[codeKey] ?? false

        return (
          <div className="my-1 border border-gray-700 rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 cursor-pointer hover:bg-gray-750"
              onMouseDown={(e) => {
                e.stopPropagation()
                toggleSection(codeKey)
              }}
            >
              <span className="text-sm font-semibold text-gray-200" style={{ fontSize: `${fontSize}px` }}>
                📜 관련 조문 (원문)
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
            {isExpanded && (
              <code
                className="block p-4 bg-gray-900 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto text-gray-200"
                style={{ fontSize: `${fontSize}px` }}
                {...props}
              >
                {children}
              </code>
            )}
          </div>
        )
      }
    }
  }, [fontSize, queryKeywords, answer, lawArticleTitles, expandedSections])

  useEffect(() => {
    let isCancelled = false
    let progressInterval: NodeJS.Timeout | null = null

    const fetchAnswer = async () => {
      setIsLoading(true)
      setError(null)
      setAnswer('')
      setCitations([])
      setProgress(0)

      // 프로그레스 시뮬레이션 (0-90%까지)
      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev
          return prev + Math.random() * 10
        })
      }, 300)

      try {
        const response = await fetch('/api/file-search-rag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })

        if (!response.ok) {
          throw new Error('File Search RAG 요청 실패')
        }

        setProgress(30)

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('스트림을 읽을 수 없습니다')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        setProgress(50)

        while (true) {
          const { done, value } = await reader.read()
          if (done || isCancelled) break

          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() === '') continue
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') {
                setProgress(100)
                continue
              }

              try {
                const parsed = JSON.parse(data)

                if (parsed.text) {
                  setAnswer(prev => prev + parsed.text)
                  setProgress(prev => Math.min(prev + 2, 95))
                }

                if (parsed.citations) {
                  setCitations(prev => {
                    const newCitations = parsed.citations.filter((newCit: Citation) =>
                      !prev.some(existingCit =>
                        existingCit.lawName === newCit.lawName &&
                        existingCit.articleNumber === newCit.articleNumber
                      )
                    )
                    return [...prev, ...newCitations]
                  })
                }
              } catch (parseError) {
                console.error('[File Search] Parse error:', parseError, 'Line:', data)
              }
            }
          }
        }

        setProgress(100)
      } catch (err) {
        if (!isCancelled) {
          console.error('[File Search] Error:', err)
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      } finally {
        if (progressInterval) {
          clearInterval(progressInterval)
        }
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchAnswer()

    return () => {
      isCancelled = true
      if (progressInterval) {
        clearInterval(progressInterval)
      }
    }
  }, [query])

  // 참고한 법령 목록 (법령명 + 조문 통합)
  const referencedLaws = React.useMemo(() => {
    const lawMap = new Map<string, { lawName: string; articles: string[]; effectiveDate?: string }>()

    citations.forEach(c => {
      const key = c.lawName
      if (lawMap.has(key)) {
        const law = lawMap.get(key)!
        if (!law.articles.includes(c.articleNumber)) {
          law.articles.push(c.articleNumber)
        }
        // 시행일 추가 (최초 발견 시만)
        if (!law.effectiveDate && c.effectiveDate) {
          law.effectiveDate = c.effectiveDate
        }
      } else {
        lawMap.set(key, {
          lawName: c.lawName,
          articles: [c.articleNumber],
          effectiveDate: c.effectiveDate
        })
      }
    })

    return Array.from(lawMap.values())
  }, [citations])

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* 질문 표시 - 다크테마 */}
      <Card className="p-4 bg-gray-950 border-gray-800">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-cyan-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-400 mb-1">질문</p>
            <p className="text-base text-white">{query}</p>
          </div>
          {onReset && !isLoading && (
            <Button variant="ghost" size="sm" onClick={onReset} className="text-gray-300 hover:text-white">
              새 검색
            </Button>
          )}
        </div>
      </Card>

      {/* 로딩 프로그레스바 */}
      {isLoading && (
        <Card className="p-4 bg-gray-950 border-gray-800">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-300">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                AI 법령 검색 중...
              </span>
              <span className="text-cyan-400 font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-gray-500 text-center">
              {progress < 30 && '📚 법령 데이터베이스 검색 중...'}
              {progress >= 30 && progress < 70 && '🔍 관련 조문 분석 중...'}
              {progress >= 70 && progress < 100 && '✍️ AI 답변 생성 중...'}
              {progress === 100 && '✨ 완료!'}
            </p>
          </div>
        </Card>
      )}

      {/* AI 답변 - 다크테마 + 컨트롤 버튼 */}
      {answer && (
        <Card className="p-6 bg-gray-950 border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-xl flex items-center gap-2 text-white">
              💡 AI 법령 해설
            </h3>
            <div className="flex items-center gap-2">
              {/* 신뢰도 표시 - 실제 인용이 있을 때만 표시 */}
              {citations.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-700 rounded">
                  <Scale className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-green-400">법령 기반</span>
                </div>
              )}
              {/* 폰트 크기 조절 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={decreaseFontSize}
                disabled={fontSize <= 12}
                className="p-1 h-7 w-7"
                title="글자 작게"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-400 min-w-[30px] text-center">{fontSize}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={increaseFontSize}
                disabled={fontSize >= 20}
                className="p-1 h-7 w-7"
                title="글자 크게"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              {/* 복사 버튼 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="p-1 h-7 w-7"
                title="답변 복사"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="max-w-none">
            <ReactMarkdown components={markdownComponents}>{processedAnswer}</ReactMarkdown>
          </div>
        </Card>
      )}


      {/* 에러 메시지 - 다크테마 */}
      {error && (
        <Card className="p-4 bg-red-950 border-red-800">
          <p className="text-red-300 text-sm">{error}</p>
        </Card>
      )}
    </div>
  )
}
