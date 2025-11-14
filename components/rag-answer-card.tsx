/**
 * RAG Answer Card Component
 *
 * AI가 생성한 답변을 표시
 */

'use client'

import { useState } from 'react'
import { Sparkles, AlertCircle, CheckCircle2, Copy, Check, ZoomIn, ZoomOut, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

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

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI 답변
          </CardTitle>
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
          <div className="flex items-start gap-2 text-xs text-red-200/80 bg-red-950/20 border border-red-800/30 p-2 rounded">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p>⚠️ 이 답변은 법령 데이터베이스에서 관련 조문을 찾지 못했습니다. 내용이 부정확할 수 있으니 주의하세요.</p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* AI 답변 내용 */}
        <div
          className="text-foreground leading-relaxed break-words whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: "1.6",
            overflowWrap: "break-word",
            wordBreak: "break-word",
          }}
        >
          <ReactMarkdown
            components={{
              // 코드 블록 스타일링 (법령 원문) - 접기/펼치기
              code: ({ node, inline, className, children, ...props }) => {
                if (inline) {
                  return <code className="px-1.5 py-0.5 bg-muted rounded font-mono" style={{ fontSize: `${fontSize - 2}px` }} {...props}>{children}</code>
                }

                // ✅ Content-based key (re-render 시에도 유지)
                const content = String(children).trim()
                const codeKey = `code_${content.substring(0, 100).replace(/[^a-zA-Z0-9가-힣]/g, '_')}`
                const isExpanded = expandedSections[codeKey] ?? false

                return (
                  <div className="my-1 border border-border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border cursor-pointer hover:bg-muted"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        toggleSection(codeKey)
                      }}
                    >
                      <span className="text-sm font-semibold text-foreground" style={{ fontSize: `${fontSize}px` }}>
                        📜 관련 조문 (원문)
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {isExpanded && (
                      <code
                        className="block p-4 bg-muted/30 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto"
                        style={{ fontSize: `${fontSize}px` }}
                        {...props}
                      >
                        {children}
                      </code>
                    )}
                  </div>
                )
              },
              // 단락 간격 - 최소화
              p: ({ node, ...props }) => <p className="my-1" style={{ fontSize: `${fontSize}px` }} {...props} />,
              // 헤딩 스타일 - 구조화 문구 (크고 굵게, 구분선)
              h3: ({ node, children, ...props }) => (
                <div className="mt-2 mb-1">
                  <h3 className="font-bold text-foreground flex items-center gap-2" style={{ fontSize: `${fontSize + 2}px` }} {...props}>
                    {children}
                  </h3>
                  <div className="h-px bg-border/50 mt-1" />
                </div>
              ),
              h4: ({ node, children, ...props }) => (
                <div className="mt-3 mb-1.5">
                  <h4 className="font-semibold text-foreground" style={{ fontSize: `${fontSize + 1}px` }} {...props}>
                    {children}
                  </h4>
                  <div className="h-px bg-border/30 mt-0.5" />
                </div>
              ),
              // 리스트 스타일 - 불릿 간결하게
              ul: ({ node, ...props }) => <ul className="my-1.5 ml-4 space-y-0" style={{ fontSize: `${fontSize}px` }} {...props} />,
              ol: ({ node, ...props }) => <ol className="my-1.5 ml-4 space-y-0" style={{ fontSize: `${fontSize}px` }} {...props} />,
              li: ({ node, ...props }) => <li className="leading-snug" style={{ fontSize: `${fontSize}px` }} {...props} />,
              // 강조 텍스트
              strong: ({ node, ...props }) => <strong className="font-bold text-foreground" style={{ fontSize: `${fontSize}px` }} {...props} />,
              // HR - 구분선
              hr: ({ node, ...props }) => <hr className="my-3 border-border" {...props} />,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        {/* 주의사항 - 다크 테마 */}
        <div className="flex items-start gap-2 text-xs text-amber-200/80 bg-amber-950/20 border border-amber-800/30 p-3 rounded">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p>이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다. 정확한 정보는 원문을 확인하거나 전문가와 상담하시기 바랍니다.</p>
        </div>
      </CardContent>
    </Card>
  )
}
