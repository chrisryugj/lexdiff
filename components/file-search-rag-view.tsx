/**
 * File Search RAG View Component
 * Google File Search 기반 RAG 인터페이스
 * law-viewer 기반으로 AI 답변 표시
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { LawViewer } from './law-viewer'
import { extractRelatedLaws, type ParsedRelatedLaw } from '@/lib/law-parser'
import { debugLogger } from '@/lib/debug-logger'
import type { LawMeta, LawArticle } from '@/lib/law-types'
import { Search, FileSearch, Sparkles, CheckCircle } from 'lucide-react'
import { SearchProgressModern as SearchProgressDialog } from './search-progress-modern'


export function FileSearchRAGView({
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
  const [progressStage, setProgressStage] = useState(0)
  const [confidenceLevel, setConfidenceLevel] = useState<'high' | 'medium' | 'low'>('high')
  const [searchStage, setSearchStage] = useState<'searching' | 'parsing' | 'streaming' | 'complete'>('searching')
  const [searchProgress, setSearchProgress] = useState(0)
  const [currentQuery, setCurrentQuery] = useState(initialQuery) // 현재 검색 중인 질의

  // 프로그레스에 표시할 질의 (ref로 즉시 업데이트)
  const searchingQueryRef = useRef(initialQuery)

  // 선택된 관련 법령 데이터 (Phase 4)
  const [selectedLawMeta, setSelectedLawMeta] = useState<LawMeta | null>(null)
  const [selectedLawArticles, setSelectedLawArticles] = useState<LawArticle[]>([])
  const [selectedJo, setSelectedJo] = useState<string | undefined>(undefined)
  const [isLoadingLaw, setIsLoadingLaw] = useState(false)

  // 더미 meta/articles (AI 모드에서는 사용 안 함)
  const dummyMeta: LawMeta = {
    lawId: '',
    lawTitle: 'AI 답변',
    promulgationDate: '',
    lawType: ''
  }
  const dummyArticles: LawArticle[] = []

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
   * 프로그레스 단계 자동 전환 (로딩 중일 때만)
   */
  useEffect(() => {
    if (!isAnalyzing) return

    const timer = setInterval(() => {
      setProgressStage((prev) => (prev + 1) % 4)
    }, 1500)

    return () => clearInterval(timer)
  }, [isAnalyzing])

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
      setProgressStage(0)
      setConfidenceLevel('high') // 초기값은 높음으로 가정

      // 프로그레스 초기화
      setSearchStage('searching')
      setSearchProgress(10)

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

      // SSE 스트리밍 읽기
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      // 스트리밍 시작
      setSearchStage('streaming')
      setSearchProgress(50)

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

  /**
   * 관련 법령 클릭 핸들러
   * API 호출하여 조문 전문 로드
   */
  async function handleRelatedArticleClick(lawName: string, jo: string, article: string) {
    try {
      setIsLoadingLaw(true)
      debugLogger.info('관련 법령 클릭', { lawName, jo, article })

      // 1. 법령 검색 (lawId 획득) - XML 파싱
      const searchRes = await fetch(`/api/law-search?query=${encodeURIComponent(lawName)}`)
      if (!searchRes.ok) {
        throw new Error('법령 검색 실패')
      }

      const searchXml = await searchRes.text()

      // XML 파싱
      const parser = new DOMParser()
      const searchDoc = parser.parseFromString(searchXml, 'text/xml')
      const lawNode = searchDoc.querySelector('law')

      if (!lawNode) {
        throw new Error('법령을 찾을 수 없습니다')
      }

      const lawId = lawNode.querySelector('법령ID')?.textContent || undefined
      const mst = lawNode.querySelector('법령일련번호')?.textContent || undefined
      const lawTitle = lawNode.querySelector('법령명한글')?.textContent || lawName

      if (!lawId && !mst) {
        throw new Error('법령 ID를 찾을 수 없습니다')
      }

      debugLogger.success('법령 검색 성공', { lawId, mst, lawTitle })

      // 2. 법령 전문 로드 - 원본 JSON 스키마 사용
      const eflawRes = await fetch(`/api/eflaw?${lawId ? `lawId=${lawId}` : `mst=${mst}`}`)
      if (!eflawRes.ok) {
        throw new Error('법령 전문 로드 실패')
      }

      const eflawJson = await eflawRes.json()
      const lawData = eflawJson?.법령

      if (!lawData) {
        throw new Error('법령 데이터가 없습니다')
      }

      // 조문 파싱 (기본 법령뷰 방식)
      const rawArticleUnits = lawData?.조문?.조문단위
      const articleUnits = Array.isArray(rawArticleUnits)
        ? rawArticleUnits
        : rawArticleUnits
        ? [rawArticleUnits]
        : []

      if (articleUnits.length === 0) {
        throw new Error('조문을 찾을 수 없습니다')
      }

      // LawMeta 구성
      const meta: LawMeta = {
        lawId: lawId || '',
        lawTitle: lawData.기본정보?.법령명_한글 || lawTitle,
        promulgationDate: lawData.기본정보?.공포일자 || '',
        lawType: lawData.기본정보?.법종구분 || ''
      }

      // LawArticle[] 구성
      const articles: LawArticle[] = articleUnits.map((unit: any) => {
        let content = unit.조문내용 || ''
        const title = unit.조문제목 || ''

        // 조문내용에서 첫 줄이 제목과 같으면 제거
        if (content && title) {
          const lines = content.split('\n')
          if (lines[0].includes(title) || lines[0].includes(unit.조문번호)) {
            content = lines.slice(1).join('\n')
          }
        }

        return {
          jo: (unit.조문키 || '').slice(0, 6),
          joNum: unit.조문번호 || '',
          title,
          content,
          isPreamble: false
        }
      })

      debugLogger.success('법령 전문 로드 성공', {
        lawTitle: meta.lawTitle,
        articleCount: articles.length
      })

      // 3. 상태 업데이트
      setSelectedLawMeta(meta)
      setSelectedLawArticles(articles)
      setSelectedJo(jo)
      setIsLoadingLaw(false)

      // 외부 콜백 호출
      onCitationClick?.(lawName, article)

    } catch (err) {
      debugLogger.error('관련 법령 로드 실패', err)
      console.error('Failed to load related law:', err)
      setIsLoadingLaw(false)
      alert(err instanceof Error ? err.message : '법령 로드 중 오류가 발생했습니다')
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
    <div className="flex flex-col h-full relative" style={{ fontFamily: "Pretendard, sans-serif" }}>
      {/* 프로그레스 Dialog */}
      <SearchProgressDialog
        key={searchingQueryRef.current}
        isOpen={isAnalyzing}
        mode="ai"
        stage={searchStage}
        progress={searchProgress}
        lawName={searchingQueryRef.current}
      />

      {/* Loading Overlay - 스트리밍 중에도 유지 */}
      {isAnalyzing && false && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="w-full max-w-md px-6">
            {/* Progress Steps */}
            <div className="space-y-4 mb-8">
              {[
                { icon: Search, label: '법령 데이터베이스 검색', stage: 0 },
                { icon: FileSearch, label: '관련 조문 분석', stage: 1 },
                { icon: Sparkles, label: 'AI 답변 생성', stage: 2 },
                { icon: CheckCircle, label: '답변 최적화', stage: 3 }
              ].map(({ icon: Icon, label, stage }) => {
                const isActive = progressStage === stage
                const isCompleted = progressStage > stage

                return (
                  <div
                    key={stage}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-primary/10 border border-primary/20'
                        : isCompleted
                        ? 'bg-muted/50'
                        : 'opacity-40'
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 rounded-full p-2 ${
                        isActive
                          ? 'bg-primary text-primary-foreground animate-pulse'
                          : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-muted'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${
                          isActive
                            ? 'text-primary'
                            : isCompleted
                            ? 'text-muted-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {label}
                      </p>
                    </div>
                    {isActive && (
                      <div className="flex gap-1">
                        <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Progress Bar */}
            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                style={{ width: `${((progressStage + 1) / 4) * 100}%` }}
              />
            </div>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {!analysis ? '전체 법령에서 관련 내용을 검색하고 있습니다' : 'AI 답변을 생성하고 있습니다...'}
            </p>
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
            meta={dummyMeta}
            articles={dummyArticles}
            selectedJo={undefined}
            favorites={new Set()}
            isOrdinance={false}
            viewMode="single"
            aiAnswerMode={true}
            aiAnswerContent={analysis}
            relatedArticles={relatedLaws}
            comparisonLawMeta={selectedLawMeta || undefined}
            comparisonLawArticles={selectedLawArticles}
            comparisonLawSelectedJo={selectedJo}
            isLoadingComparison={isLoadingLaw}
          />

          {/* Loading Law Indicator - 프로그레스 다이얼로그와 겹치지 않도록 제거 */}
          {/* isLoadingLaw는 LawViewer의 isLoadingComparison으로 전달되어 내부에서 처리됨 */}
        </>
      )}
    </div>
  )
}
