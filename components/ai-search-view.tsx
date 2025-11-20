/**
 * AI Search View Component
 * Google File Search 기반 AI 검색 인터페이스
 * law-viewer 기반으로 AI 답변 표시
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { LawViewer } from './law-viewer'
import { extractRelatedLaws, type ParsedRelatedLaw } from '@/lib/law-parser'
import { debugLogger } from '@/lib/debug-logger'
import type { LawMeta, LawArticle } from '@/lib/law-types'
import { Search, FileSearch, Sparkles, CheckCircle } from 'lucide-react'
import { ModernProgressBar } from '@/components/ui/modern-progress-bar'


export function AISearchView({
  initialQuery,
  onCitationClick
}: {
  initialQuery: string
  onCitationClick?: (lawName: string, articleNum: string) => void
}) {
  const [analysis, setAnalysis] = useState<string>('')
  const [relatedLaws, setRelatedLaws] = useState<ParsedRelatedLaw[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [confidenceLevel, setConfidenceLevel] = useState<'high' | 'medium' | 'low'>('high')
  const [searchStage, setSearchStage] = useState<'searching' | 'parsing' | 'streaming' | 'complete'>('searching')
  const [searchProgress, setSearchProgress] = useState(0)
  const [currentQuery, setCurrentQuery] = useState(initialQuery) // 현재 검색 중인 질의
  const [progressMessage, setProgressMessage] = useState('') // 프로그래스바 메시지

  // 프로그레스에 표시할 질의 (ref로 즉시 업데이트)
  const searchingQueryRef = useRef(initialQuery)

  /**
   * AI 답변 완료 후 관련 법령 추출
   */
  useEffect(() => {
    if (analysis && !isAnalyzing) {
      const laws = extractRelatedLaws(analysis)
      setRelatedLaws(laws)
      debugLogger.success('관련 법령 추출 완료', { count: laws.length })
    }
  }, [analysis, isAnalyzing])

  /**
   * File Search RAG 쿼리 실행
   */
  async function handleFileSearchQuery(searchQuery: string) {
    try {
      // ⚠️ CRITICAL: ref로 즉시 업데이트 (state는 비동기)
      console.log('[FileSearchRAG] handleFileSearchQuery called with:', searchQuery)
      searchingQueryRef.current = searchQuery
      setCurrentQuery(searchQuery)

      setError(null)
      setWarning(null)
      setIsAnalyzing(true)
      setAnalysis('')
      setRelatedLaws([])
      setConfidenceLevel('high') // 초기값은 높음으로 가정

      // 프로그레스 초기화
      setSearchStage('searching')
      setSearchProgress(10)
      setProgressMessage('Gemini 2.5 Flash로 검색 중...')

      const response = await fetch('/api/file-search-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      // 검색 완료 → 파싱 단계
      setSearchStage('parsing')
      setSearchProgress(30)
      setProgressMessage('법령 데이터 파싱 중...')

      // SSE 스트리밍 읽기
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      // 스트리밍 시작
      setSearchStage('streaming')
      setSearchProgress(50)
      setProgressMessage('AI 답변 생성 중...')

      let buffer = ''
      let streamChunkCount = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              setIsAnalyzing(false)
              continue
            }

            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'text') {
                setAnalysis(prev => prev + parsed.text)
                streamChunkCount++
                // 프로그레스: 50% → 95% (청크 수에 따라)
                const progress = Math.min(50 + streamChunkCount * 5, 95)
                setSearchProgress(progress)
              } else if (parsed.type === 'warning') {
                setWarning(parsed.message)
                debugLogger.warning('AI 답변 경고', { message: parsed.message })
              } else if (parsed.type === 'citations') {
                // ✅ 신뢰도 레벨 업데이트
                if (parsed.confidenceLevel) {
                  setConfidenceLevel(parsed.confidenceLevel)
                  debugLogger.info('신뢰도 레벨 수신', { level: parsed.confidenceLevel })
                }
                debugLogger.info('Citations 수신', {
                  count: parsed.citations?.length || 0,
                  finishReason: parsed.finishReason,
                  confidenceLevel: parsed.confidenceLevel
                })
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      // ✅ 루프 종료 후 남은 buffer 처리 (마지막 청크 누락 방지)
      if (buffer.trim()) {
        debugLogger.info('SSE 스트림 종료 후 남은 버퍼 처리', { bufferLength: buffer.length })

        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6)

          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'text') {
                setAnalysis(prev => prev + parsed.text)
                debugLogger.success('남은 버퍼에서 텍스트 추가', { length: parsed.text.length })
              } else if (parsed.type === 'warning') {
                setWarning(parsed.message)
                debugLogger.warning('AI 답변 경고 (버퍼)', { message: parsed.message })
              } else if (parsed.type === 'citations') {
                // ✅ 신뢰도 레벨 업데이트 (버퍼)
                if (parsed.confidenceLevel) {
                  setConfidenceLevel(parsed.confidenceLevel)
                  debugLogger.info('신뢰도 레벨 수신 (버퍼)', { level: parsed.confidenceLevel })
                }
                debugLogger.info('Citations 수신 (버퍼)', {
                  count: parsed.citations?.length || 0,
                  finishReason: parsed.finishReason,
                  confidenceLevel: parsed.confidenceLevel
                })
              }
            } catch (e) {
              debugLogger.error('남은 버퍼 파싱 실패', { error: e, buffer })
            }
          }
        }
      }

      // 완료 - 프로그레스 완료 표시 후 딜레이
      setSearchStage('complete')
      setSearchProgress(100)
      setProgressMessage('검색 완료!')

      // 완료 상태 표시 후 프로그레스 닫기
      setTimeout(() => {
        setIsAnalyzing(false)
      }, 600)

    } catch (err) {
      console.error('File Search error:', err)
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.')
      setIsAnalyzing(false)
      setSearchStage('complete')
      setSearchProgress(0)
    }
  }


  // initialQuery가 변경되면 ref도 함께 업데이트
  useEffect(() => {
    searchingQueryRef.current = initialQuery
    setCurrentQuery(initialQuery)
  }, [initialQuery])

  // 초기 쿼리가 있고 아직 분석 안 했으면 자동 실행
  useEffect(() => {
    if (initialQuery && !analysis && !isAnalyzing) {
      handleFileSearchQuery(initialQuery)
    }
  }, [initialQuery])

  return (
    <div className="flex flex-col h-full relative">
      {/* 프로그레스 오버레이 - ModernProgressBar 사용 */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="w-full max-w-md px-6">
            <ModernProgressBar
              progress={searchProgress}
              label="AI 검색"
              statusMessage={progressMessage}
              variant="lavender"
              size="lg"
              animationDuration={800}
            />
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                {currentQuery && `"${currentQuery}" 검색 중...`}
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center h-full p-6">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-4 max-w-md">
            <div className="flex items-start gap-2">
              <span className="text-destructive">❌</span>
              <div className="flex-1">
                <h4 className="font-medium text-destructive">오류 발생</h4>
                <p className="text-sm text-destructive mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Result - LawViewer AI Mode */}
      {analysis && !error && (
        <>
          {/* Confidence Badge */}
          <div className="mx-4 mt-4 flex items-center gap-2">
            {confidenceLevel === 'high' && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">신뢰도 높음</span>
              </div>
            )}
            {confidenceLevel === 'medium' && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-full">
                <span className="text-yellow-600 dark:text-yellow-500">⚠️</span>
                <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">신뢰도 보통</span>
              </div>
            )}
            {confidenceLevel === 'low' && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full">
                <span className="text-red-600 dark:text-red-500">❌</span>
                <span className="text-sm font-medium text-red-700 dark:text-red-300">신뢰도 낮음</span>
              </div>
            )}
          </div>

          {/* Warning Banner */}
          {warning && (
            <div className="mx-4 mt-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-500">⚠️</span>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">{warning}</p>
              </div>
            </div>
          )}

          <LawViewer
            aiAnswerMode={true}
            aiAnswerContent={analysis}
            relatedArticles={relatedLaws}
            aiConfidenceLevel={confidenceLevel}
            favorites={new Set()}
            isOrdinance={false}
            viewMode="single"
          />
        </>
      )}
    </div>
  )
}
