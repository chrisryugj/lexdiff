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
import { CONFIDENCE_CONFIGS, ALERT_CONFIGS, detectAlertType } from '@/lib/answer-section-icons'
import { getCachedResponse, cacheResponse } from '@/lib/rag-response-cache'  // Phase 3 P3


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
  const [citations, setCitations] = useState<any[]>([]) // ✅ 인용 출처 목록
  const [queryType, setQueryType] = useState<'specific' | 'general' | 'comparison' | 'procedural'>('general') // ✅ 쿼리 타입

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

      // ✅ Phase 3 P3: 캐시 확인
      const cached = await getCachedResponse(searchQuery)
      if (cached) {
        console.log('[RAG Cache] Using cached response')
        setAnalysis(cached.response)
        setConfidenceLevel(cached.confidenceLevel as 'high' | 'medium' | 'low')
        setCitations(cached.citations || []) // ✅ 캐시에서 citations 복원
        setIsAnalyzing(false)
        setSearchStage('complete')
        setSearchProgress(100)
        setProgressMessage('✅ 캐시된 답변 표시')
        return
      }

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
      let fullResponse = ''  // Phase 3 P3: 전체 응답 수집
      let finalCitations: any[] = []  // Phase 3 P3: Citation 수집
      let finalConfidenceLevel = 'high'  // Phase 3 P3: 신뢰도 수집

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
                fullResponse += parsed.text  // Phase 3 P3: 전체 응답 수집
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
                  finalConfidenceLevel = parsed.confidenceLevel  // Phase 3 P3: 수집
                  debugLogger.info('신뢰도 레벨 수신', { level: parsed.confidenceLevel })
                }
                if (parsed.citations) {
                  finalCitations = parsed.citations  // Phase 3 P3: 수집
                  setCitations(parsed.citations) // ✅ 사이드바에 표시할 citations 설정
                }
                // ✅ 쿼리 타입 수집
                if (parsed.queryType) {
                  setQueryType(parsed.queryType)
                  debugLogger.info('쿼리 타입 수신', { type: parsed.queryType })
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
                fullResponse += parsed.text  // Phase 3 P3: 전체 응답 수집
                debugLogger.success('남은 버퍼에서 텍스트 추가', { length: parsed.text.length })
              } else if (parsed.type === 'warning') {
                setWarning(parsed.message)
                debugLogger.warning('AI 답변 경고 (버퍼)', { message: parsed.message })
              } else if (parsed.type === 'citations') {
                // ✅ 신뢰도 레벨 업데이트 (버퍼)
                if (parsed.confidenceLevel) {
                  setConfidenceLevel(parsed.confidenceLevel)
                  finalConfidenceLevel = parsed.confidenceLevel  // Phase 3 P3: 수집
                  debugLogger.info('신뢰도 레벨 수신 (버퍼)', { level: parsed.confidenceLevel })
                }
                if (parsed.citations) {
                  finalCitations = parsed.citations  // Phase 3 P3: 수집
                  setCitations(parsed.citations) // ✅ 사이드바에 표시할 citations 설정
                }
                // ✅ 쿼리 타입 수집 (버퍼)
                if (parsed.queryType) {
                  setQueryType(parsed.queryType)
                  debugLogger.info('쿼리 타입 수신 (버퍼)', { type: parsed.queryType })
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

      // ✅ Phase 3 P3: 캐시에 응답 저장
      if (fullResponse && finalCitations) {
        await cacheResponse(searchQuery, fullResponse, finalCitations, finalConfidenceLevel)
        debugLogger.success('[RAG Cache] Response cached', {
          queryLength: searchQuery.length,
          responseLength: fullResponse.length,
          citationsCount: finalCitations.length
        })
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
          {/* Confidence Badge & Query Type */}
          <div className="mx-2 sm:mx-4 mt-4 flex items-center gap-2 flex-wrap">
            {/* Confidence Badge */}
            {(() => {
              const config = CONFIDENCE_CONFIGS[confidenceLevel]
              const Icon = config.icon

              return (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${config.bgColor} border ${config.borderColor} rounded-full`}>
                  <Icon className={`h-4 w-4 ${config.iconColor}`} />
                  <span className={`text-sm font-medium ${config.textColor}`}>{config.label}</span>
                </div>
              )
            })()}

            {/* Query Type Badge */}
            {(() => {
              const typeConfigs = {
                specific: { icon: BookOpen, label: '특정 조문', color: 'bg-blue-50 border-blue-200 text-blue-700' },
                general: { icon: Search, label: '일반 질문', color: 'bg-gray-50 border-gray-200 text-gray-700' },
                comparison: { icon: Scale, label: '비교 질문', color: 'bg-purple-50 border-purple-200 text-purple-700' },
                procedural: { icon: Sparkles, label: '절차 질문', color: 'bg-green-50 border-green-200 text-green-700' }
              }
              const config = typeConfigs[queryType]
              const TypeIcon = config.icon

              return (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${config.color} border rounded-full`}>
                  <TypeIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
              )
            })()}
          </div>

          {/* Warning Banner */}
          {warning && (() => {
            const alertType = detectAlertType(warning)
            const config = ALERT_CONFIGS[alertType]
            const Icon = config.icon

            return (
              <div className={`mx-2 sm:mx-4 mt-2 ${config.bgColor} border ${config.borderColor} rounded-lg p-2 sm:p-3`}>
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                  <p className={`text-xs sm:text-sm ${config.textColor}`}>{warning.replace(/⚠️|❌|✅/g, '').trim()}</p>
                </div>
              </div>
            )
          })()}

          <LawViewer
            aiAnswerMode={true}
            aiAnswerContent={analysis}
            relatedArticles={relatedLaws}
            aiConfidenceLevel={confidenceLevel}
            aiCitations={citations}
            favorites={new Set()}
            isOrdinance={false}
            viewMode="single"
          />
        </>
      )}
    </div>
  )
}
