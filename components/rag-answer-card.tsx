/**
 * RAG Answer Card Component
 *
 * AI가 생성한 답변을 표시 (HTML 기반 렌더링)
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, AlertCircle, CheckCircle2, Copy, Check, ZoomIn, ZoomOut, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseRelatedLawTitle } from '@/lib/law-parser'

interface RagAnswerCardProps {
  answer: {
    content: string
    citations: Array<{
      lawName: string
      articleDisplay: string
      relevance: 'high' | 'medium' | 'low'
    }>
    confidence: 'high' | 'medium' | 'low'
  }
  onCitationClick?: (lawName: string, articleDisplay: string) => void
}

export function RagAnswerCard({ answer, onCitationClick }: RagAnswerCardProps) {
  const { content, citations, confidence } = answer
  const [fontSize, setFontSize] = useState(14) // 기본 14px
  const [copied, setCopied] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const contentRef = useRef<HTMLDivElement>(null)

  // 신뢰도 아이콘 및 색상 (다크 테마)
  const getConfidenceDisplay = (level: string) => {
    // 시테이션이 없으면 무조건 낮은 신뢰도
    if (citations.length === 0) {
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        label: '출처 없음',
        className: 'text-red-400 bg-red-950/50 border-red-800',
      }
    }

    switch (level) {
      case 'high':
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          label: '높은 신뢰도',
          className: 'text-green-400 bg-green-950/50 border-green-800',
        }
      case 'medium':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          label: '중간 신뢰도',
          className: 'text-yellow-400 bg-yellow-950/50 border-yellow-800',
        }
      default:
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          label: '낮은 신뢰도',
          className: 'text-gray-400 bg-gray-950/50 border-gray-800',
        }
    }
  }

  const confidenceDisplay = getConfidenceDisplay(confidence)

  // 복사 기능
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 글자 크기 조절
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 2, 24))
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 2, 10))

  // 섹션 토글
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
  }

  // HTML 변환
  const convertToHTML = (markdown: string): string => {
    if (!markdown) return ''

    const lines = markdown.split('\n')
    const html: string[] = []

    let inCodeBlock = false
    let codeContent: string[] = []
    let codeBlockIndex = 0
    let inList = false

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]

      // 코드 블록 시작/종료
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // 코드 블록 종료
          const codeKey = `code_${codeBlockIndex}`
          const codeText = codeContent.join('\n')
          const isExpanded = expandedSections[codeKey] ?? false

          // 발췌조문 내용에서 조문 제목을 <strong>으로 감싸기
          let formattedCodeText = escapeHtml(codeText)
          // 조문 번호와 제목을 굵게 처리 (예: "제35조(협정관세의 적용제한)" → "<strong>제35조(협정관세의 적용제한)</strong>")
          formattedCodeText = formattedCodeText.replace(/^(제\d+조(?:의\d+)?(?:\s*\([^)]+\))?)/, '<strong>$1</strong>')

          html.push(`
            <div class="my-1 border border-border rounded-lg overflow-hidden">
              <div
                class="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border cursor-pointer hover:bg-muted code-block-toggle"
                data-code-key="${codeKey}"
              >
                <span class="text-sm font-semibold text-foreground" style="font-size: ${fontSize}px">
                  📜 발췌 조문
                </span>
                <span class="code-block-icon">
                  ${isExpanded ? '▲' : '▼'}
                </span>
              </div>
              <code
                class="block p-4 bg-muted/30 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto code-block-content ${isExpanded ? '' : 'hidden'}"
                style="font-size: ${fontSize}px"
              >${formattedCodeText}</code>
            </div>
          `)

          inCodeBlock = false
          codeContent = []
          codeBlockIndex++
        } else {
          // 코드 블록 시작
          inCodeBlock = true
          if (inList) {
            html.push('</ul>')
            inList = false
          }
        }
        continue
      }

      // 코드 블록 내부
      if (inCodeBlock) {
        codeContent.push(line)
        continue
      }

      // 빈 줄
      if (!line.trim()) {
        if (inList) {
          html.push('</ul>')
          inList = false
        }
        html.push('<br />')
        continue
      }

      // 헤더
      if (line.startsWith('###')) {
        if (inList) {
          html.push('</ul>')
          inList = false
        }
        const headerText = line.replace(/^###\s*/, '')
        html.push(`<h3 class="text-base font-semibold mt-4 mb-2 border-b border-border/50 pb-1" style="font-size: ${fontSize + 2}px">${escapeHtml(headerText)}</h3>`)
        continue
      }

      if (line.startsWith('##')) {
        if (inList) {
          html.push('</ul>')
          inList = false
        }
        const headerText = line.replace(/^##\s*/, '')
        html.push(`<h2 class="text-lg font-bold mt-6 mb-3 border-b border-border pb-1" style="font-size: ${fontSize + 4}px">${escapeHtml(headerText)}</h2>`)
        continue
      }

      // 리스트 아이템 (이모지 감지하여 불릿 제거)
      const listMatch = line.match(/^(\s*)[-*]\s+(.+)/)
      if (listMatch) {
        const [, indent, content] = listMatch
        const hasEmoji = /^[\u{1F300}-\u{1F9FF}]/u.test(content.trim())

        if (!inList) {
          // 이모지가 있으면 불릿 없는 리스트, 없으면 불릿 있는 리스트
          const listClass = hasEmoji ? 'list-none' : 'list-disc list-inside'
          html.push(`<ul class="${listClass} space-y-0 my-1.5 ml-4" style="font-size: ${fontSize}px">`)
          inList = true
        }

        const processedContent = processInlineFormatting(content)
        html.push(`<li class="leading-snug">${processedContent}</li>`)
        continue
      }

      // 리스트 종료
      if (inList && !line.match(/^\s*[-*]\s+/)) {
        html.push('</ul>')
        inList = false
      }

      // HR
      if (line.trim() === '---' || line.trim() === '***') {
        html.push('<hr class="my-3 border-border" />')
        continue
      }

      // 일반 단락
      const processedLine = processInlineFormatting(line)
      html.push(`<p class="my-1 leading-relaxed" style="font-size: ${fontSize}px">${processedLine}</p>`)
    }

    // 열린 태그 닫기
    if (inList) html.push('</ul>')

    return html.join('\n')
  }

  // 인라인 포맷팅 처리
  function processInlineFormatting(text: string): string {
    let result = escapeHtml(text)

    // 볼드
    result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')

    // 이탤릭
    result = result.replace(/\*([^*]+?)\*/g, '<em>$1</em>')

    // 코드 (인라인)
    result = result.replace(/`([^`]+?)`/g, `<code class="px-1.5 py-0.5 bg-muted rounded font-mono" style="font-size: ${fontSize - 2}px">$1</code>`)

    // 법령 링크 감지 (예: "관세법 제38조", "관세법 제10조의2")
    result = result.replace(
      /([가-힣()]+(?:법|령|규칙|조례))\s*(제\d+조(?:의\d+)?)/g,
      (match, lawName, article) => {
        const parsed = parseRelatedLawTitle(`${lawName} ${article}`, 'rag')
        if (parsed) {
          return `<a href="#" class="law-link text-blue-400 hover:text-blue-300 underline cursor-pointer" data-law="${escapeHtml(parsed.lawName)}" data-jo="${escapeHtml(parsed.jo)}" data-article="${escapeHtml(parsed.article)}" data-source="rag">🔗 ${escapeHtml(match)}</a>`
        }
        return escapeHtml(match)
      }
    )

    return result
  }

  // HTML 이스케이프
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  // 링크 클릭 핸들러 설정
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('.law-link')

      if (link) {
        e.preventDefault()
        const lawName = link.getAttribute('data-law')
        const article = link.getAttribute('data-article')

        if (lawName && article && onCitationClick) {
          console.log('📍 RAG 답변 링크 클릭:', { lawName, article })
          onCitationClick(lawName, article)
        }
      }
    }

    // 코드 블록 토글 핸들러
    const handleCodeBlockToggle = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const toggle = target.closest('.code-block-toggle')

      if (toggle) {
        e.stopPropagation()
        const codeKey = toggle.getAttribute('data-code-key')
        if (codeKey) {
          toggleSection(codeKey)
        }
      }
    }

    const contentEl = contentRef.current
    if (contentEl) {
      contentEl.addEventListener('click', handleLinkClick)
      contentEl.addEventListener('click', handleCodeBlockToggle)

      return () => {
        contentEl.removeEventListener('click', handleLinkClick)
        contentEl.removeEventListener('click', handleCodeBlockToggle)
      }
    }
  }, [onCitationClick, expandedSections])

  // HTML 생성 (expandedSections 변경 시 재생성)
  const htmlContent = convertToHTML(content)

  return (
    <div className="border-2 border-purple-500/30 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 bg-card/50 backdrop-blur-xl">
      <div className="pb-3 px-6 pt-6 border-b border-border/50">
          {/* 🎨 AI 헤더 with Glow Effect */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {/* Glowing AI Icon */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-xl opacity-50 animate-pulse" />
                <div className="relative bg-gradient-to-br from-blue-600 to-purple-600 p-2 rounded-xl shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
              </div>
              <div>
                <CardTitle className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  AI 답변
                </CardTitle>
                <p className="text-xs text-muted-foreground">Gemini 2.5 Flash 분석 결과</p>
              </div>
            </div>
          <div className="flex items-center gap-2">
            {/* 글자 크기 조절 */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={decreaseFontSize}
                className="h-7 w-7 p-0"
                title="글자 작게"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={increaseFontSize}
                className="h-7 w-7 p-0"
                title="글자 크게"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            {/* 복사 버튼 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2"
              title="답변 복사"
            >
              {copied ? (
                <><Check className="h-4 w-4 mr-1" /> 복사됨</>
              ) : (
                <><Copy className="h-4 w-4 mr-1" /> 복사</>
              )}
            </Button>

            <Badge className={confidenceDisplay.className}>
              {confidenceDisplay.icon}
              <span className="ml-1">{confidenceDisplay.label}</span>
            </Badge>
          </div>
        </div>

      {/* 시테이션 없을 때 경고 */}
      {citations.length === 0 && (
        <div className="flex items-start gap-2 text-xs text-red-200/80 bg-red-950/20 border border-red-800/30 p-2 rounded mx-6 mb-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p>⚠️ 이 답변은 법령 데이터베이스에서 관련 조문을 찾지 못했습니다. 내용이 부정확할 수 있으니 주의하세요.</p>
        </div>
      )}
    </div>

    <div className="space-y-3 px-6 pb-6">
        {/* AI 답변 내용 (HTML 렌더링) */}
        <div
          ref={contentRef}
          className="text-foreground leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert"
          style={{
            overflowWrap: "break-word",
            wordBreak: "break-word",
          }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />

    {/* 주의사항 - 다크 테마 */}
    <div className="flex items-start gap-2 text-xs text-amber-200/80 bg-amber-950/20 border border-amber-800/30 p-3 rounded">
      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
      <p>이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다. 정확한 정보는 원문을 확인하거나 전문가와 상담하시기 바랍니다.</p>
    </div>
    </div>
  </div>
  )
}
