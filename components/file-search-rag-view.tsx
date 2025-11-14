/**
 * File Search RAG View Component
 * Google File Search 기반 RAG 인터페이스
 * law-viewer 기반으로 AI 답변 표시
 */

'use client'

import { useState, useEffect } from 'react'
import { LawViewer } from './law-viewer'
import { extractRelatedLaws, type ParsedRelatedLaw } from '@/lib/law-parser'
import { debugLogger } from '@/lib/debug-logger'
import type { LawMeta, LawArticle } from '@/lib/law-types'
import { Search, FileSearch, Sparkles, CheckCircle } from 'lucide-react'


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
  const [progressStage, setProgressStage] = useState(0)

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
      setError(null)
      setIsAnalyzing(true)
      setAnalysis('')
      setRelatedLaws([])
      setProgressStage(0)

      const response = await fetch('/api/file-search-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      // SSE 스트리밍 읽기
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

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
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      setIsAnalyzing(false)

    } catch (err) {
      console.error('File Search error:', err)
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.')
      setIsAnalyzing(false)
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

      // 1. 법령 검색 (lawId 획득)
      const searchRes = await fetch(`/api/law-search?query=${encodeURIComponent(lawName)}`)
      if (!searchRes.ok) {
        throw new Error('법령 검색 실패')
      }

      const searchData = await searchRes.json()
      if (!searchData.success || !searchData.data || searchData.data.length === 0) {
        throw new Error('법령을 찾을 수 없습니다')
      }

      const law = searchData.data[0]
      const lawId = law.lawId || law.mst

      debugLogger.success('법령 검색 성공', { lawId, lawTitle: law.lawTitle })

      // 2. 법령 전문 로드
      const eflawRes = await fetch(`/api/eflaw?lawId=${lawId}`)
      if (!eflawRes.ok) {
        throw new Error('법령 전문 로드 실패')
      }

      const eflawData = await eflawRes.json()
      if (!eflawData.success) {
        throw new Error(eflawData.error || '법령 전문 로드 실패')
      }

      const { meta, articles } = eflawData

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

  // 초기 쿼리가 있고 아직 분석 안 했으면 자동 실행
  useEffect(() => {
    if (initialQuery && !analysis && !isAnalyzing) {
      handleFileSearchQuery(initialQuery)
    }
  }, [initialQuery])

  return (
    <div className="flex flex-col h-full">
      {/* Loading State */}
      {isAnalyzing && !analysis ? (
        <div className="flex items-center justify-center h-full">
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
              전체 법령에서 관련 내용을 검색하고 있습니다
            </p>
          </div>
        </div>
      ) : error ? (
        /* Error State */
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
      ) : analysis ? (
        /* Analysis Result - LawViewer AI Mode */
        <>
          <LawViewer
            meta={selectedLawMeta || dummyMeta}
            articles={selectedLawArticles.length > 0 ? selectedLawArticles : dummyArticles}
            selectedJo={selectedJo}
            favorites={new Set()}
            isOrdinance={false}
            viewMode="single"
            aiAnswerMode={true}
            aiAnswerContent={analysis}
            relatedArticles={relatedLaws}
            onRelatedArticleClick={handleRelatedArticleClick}
          />

          {/* Loading Law Indicator */}
          {isLoadingLaw && (
            <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
              <span className="text-sm">법령 전문 로딩 중...</span>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
