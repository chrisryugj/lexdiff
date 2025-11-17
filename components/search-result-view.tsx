/**
 * search-result-view.tsx
 *
 * 검색 결과 화면 컴포넌트 (page.tsx에서 복사)
 * - page.tsx의 모든 로직 유지
 * - 홈 화면 부분만 제거 (SearchView로 분리)
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/header"
import { SearchBar } from "@/components/search-bar"
import { LawViewer } from "@/components/law-viewer"
import { ComparisonModal } from "@/components/comparison-modal"
import { AISummaryDialog } from "@/components/ai-summary-dialog"
import { FavoritesPanel } from "@/components/favorites-panel"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog"
// import { FeedbackButtons } from "@/components/feedback-buttons" // 미사용으로 제거
import { ArticleNotFoundBanner } from "@/components/article-not-found-banner"
import { RagSearchPanel, type SearchOptions } from "@/components/rag-search-panel"
import { RagResultCard } from "@/components/rag-result-card"
import { RagAnswerCard } from "@/components/rag-answer-card"
import { SearchProgressDialogImproved as SearchProgressDialog } from "@/components/search-progress-dialog-improved"
import { detectQueryType } from "@/lib/query-detector"
import { extractRelatedLaws } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"
import { parseOldNewXML } from "@/lib/oldnew-parser"
import { parseLawSearchXML } from "@/lib/law-search-parser"
import { parseOrdinanceSearchXML } from "@/lib/ordin-search-parser"
import { parseOrdinanceXML } from "@/lib/ordin-parser"
import { favoritesStore } from "@/lib/favorites-store"
import { formatJO } from "@/lib/law-parser"
import { useErrorReportStore } from "@/lib/error-report-store"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Sparkles, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { LawMeta, LawArticle, Favorite, LawData } from "@/lib/law-types"
import { buildJO } from "@/lib/law-parser"

// 법령 타입별 Badge 색상 클래스 반환
function getLawTypeBadgeClass(lawType: string): string {
  const normalizedType = lawType.toLowerCase()

  if (normalizedType.includes('법률')) {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
  } else if (normalizedType.includes('시행령')) {
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
  } else if (normalizedType.includes('시행규칙')) {
    return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
  } else if (normalizedType.includes('대통령령')) {
    return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
  } else if (normalizedType.includes('총리령') || normalizedType.includes('부령')) {
    return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
  } else {
    return 'bg-secondary text-secondary-foreground'
  }
}

function convertArticleNumberToCode(
  articleNum: string | number,
  branchNum?: string | number,
): { code: string; display: string } {
  const mainNum = typeof articleNum === "string" ? Number.parseInt(articleNum) : articleNum
  const branch = branchNum ? (typeof branchNum === "string" ? Number.parseInt(branchNum) : branchNum) : 0

  if (isNaN(mainNum)) {
    return { code: "000000", display: "제0조" }
  }

  const code = mainNum.toString().padStart(4, "0") + branch.toString().padStart(2, "0")
  const display = branch > 0 ? "제" + mainNum + "조의" + branch : "제" + mainNum + "조"

  return { code, display }
}

function extractContentFromHangArray(hangArray: any[]): string {
  let content = ""

  if (!Array.isArray(hangArray)) {
    return content
  }

  for (const hang of hangArray) {
    // Extract 항내용 (paragraph content)
    if (hang.항내용) {
      let hangContent = hang.항내용

      // Handle array format (some 항내용 are arrays of strings)
      if (Array.isArray(hangContent)) {
        hangContent = hangContent.join("\n")
      }

      content += "\n" + hangContent
    }

    // Extract 호 (items) if present
    if (hang.호 && Array.isArray(hang.호)) {
      for (const ho of hang.호) {
        if (ho.호내용) {
          let hoContent = ho.호내용

          // Handle array format
          if (Array.isArray(hoContent)) {
            hoContent = hoContent.join("\n")
          }

          content += "\n" + hoContent
        }

        // Extract 목 (sub-items) if present
        if (ho.목 && Array.isArray(ho.목)) {
          for (const mok of ho.목) {
            if (mok.목내용) {
              let mokContent = mok.목내용

              // Handle array format
              if (Array.isArray(mokContent)) {
                mokContent = mokContent.join("\n")
              }

              content += "\n  " + mokContent
            }
          }
        }
      }
    }
  }

  return content
}

function parseLawJSON(jsonData: any): LawData {
  debugLogger.info("JSON 파싱 시작")

  try {
    const lawData = jsonData.법령

    if (!lawData) {
      throw new Error("법령 데이터가 없습니다")
    }

    const basicInfo = lawData.기본정보 || lawData
    const meta = {
      lawId: basicInfo.법령ID || basicInfo.법령키 || "unknown",
      lawTitle: basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || "제목 없음",
      latestEffectiveDate: basicInfo.최종시행일자 || basicInfo.시행일자 || "",
      promulgation: {
        date: basicInfo.공포일자 || "",
        number: basicInfo.공포번호 || "",
      },
      revisionType: basicInfo.제개정구분명 || basicInfo.제개정구분 || "",
      fetchedAt: new Date().toISOString(),
    }

    console.log("[v0] [JSON 파싱] 법령 제목:", meta.lawTitle)

    const articles: LawArticle[] = []
    const articleUnits = lawData.조문?.조문단위 || []

    debugLogger.info("전체 조문 단위: " + articleUnits.length + "개")

    for (let i = 0; i < articleUnits.length; i++) {
      const unit = articleUnits[i]

      if (unit.조문여부 !== "조문") {
        continue
      }

      const articleNum = unit.조문번호
      const branchNum = unit.조문가지번호
      const title = unit.조문제목 || ""

      const result = convertArticleNumberToCode(articleNum, branchNum)
      const code = result.code
      const display = result.display

      // Debug: Log article parsing for "조의" articles
      if (branchNum && Number.parseInt(branchNum) > 0) {
        console.log(`📄 [파싱] 조의 조문: ${display} (JO: ${code}, articleNum: ${articleNum}, branchNum: ${branchNum})`)
      }

      let content = ""

      if (unit.항 && Array.isArray(unit.항)) {
        content = extractContentFromHangArray(unit.항)
      }
      // Fallback: if 항 is an object with 호 array (old structure)
      else if (unit.항 && typeof unit.항 === "object" && unit.항.호) {
        if (Array.isArray(unit.항.호)) {
          for (const ho of unit.항.호) {
            if (ho.호내용) {
              let hoContent = ho.호내용
              if (Array.isArray(hoContent)) {
                hoContent = hoContent.join("\n")
              }
              content += "\n" + hoContent
            }
          }
        }
      } else if (unit.조문내용 && typeof unit.조문내용 === "string") {
        let rawContent = unit.조문내용.trim()

        // Remove the article header (e.g., "제28조(개별소비세의 사무 관할)")
        // Pattern: 제N조(제목) or 제N조의M(제목)
        const headerPattern = /^제\d+조(?:의\d+)?$$[^)]+$$\s*/
        rawContent = rawContent.replace(headerPattern, "")

        content = rawContent
      }

      articles.push({
        jo: code,
        joNum: display,
        title: title,
        content: content.trim(),
        isPreamble: false,
      })
    }

    debugLogger.success("JSON 파싱 완료: " + articles.length + "개 조문")

    // Debug: Show JO code range
    if (articles.length > 0) {
      console.log(`📄 [파싱 완료] ${meta.lawTitle}: ${articles.length}개 조문`)
      console.log(`   JO 코드 범위: ${articles[0]?.jo} (${articles[0]?.joNum}) ~ ${articles[articles.length - 1]?.jo} (${articles[articles.length - 1]?.joNum})`)

      // Show all "조의" articles
      const branchArticles = articles.filter(a => {
        const branchNum = parseInt(a.jo.slice(-2))
        return branchNum > 0
      })
      if (branchArticles.length > 0) {
        console.log(`   조의 조문 ${branchArticles.length}개:`, branchArticles.map(a => `${a.jo}(${a.joNum})`).join(', '))
      }
    }

    return {
      meta: meta,
      articles: articles,
      articleCount: articles.length,
    }
  } catch (error) {
    debugLogger.error("JSON 파싱 오류", error)
    throw error
  }
}

interface LawSearchResult {
  lawId?: string
  mst?: string
  lawName: string
  lawType: string
  promulgationDate?: string
  effectiveDate?: string
}

interface OrdinanceSearchResult {
  ordinSeq: string
  ordinName: string
  ordinId: string
  promulgationDate?: string
  effectiveDate?: string
  orgName?: string
  ordinKind?: string
}

type SearchMode = 'basic' | 'rag'

export interface SearchResultViewProps {
  searchId: string
  onBack: () => void
  onProgressUpdate?: (stage: 'searching' | 'parsing' | 'streaming' | 'complete', progress: number) => void
  onModeChange?: (mode: 'basic' | 'rag') => void
}

export function SearchResultView({ searchId, onBack, onProgressUpdate, onModeChange }: SearchResultViewProps) {
  const [isSearching, setIsSearching] = useState(false)
  const [lawData, setLawData] = useState<{
    meta: LawMeta
    articles: LawArticle[]
    selectedJo?: string
    isOrdinance?: boolean
    viewMode?: "single" | "full"
    searchQueryId?: number
    searchResultId?: number
  } | null>(null)
  const [lawSelectionState, setLawSelectionState] = useState<{
    results: LawSearchResult[]
    query: { lawName: string; article?: string; jo?: string }
  } | null>(null)
  const [ordinanceSelectionState, setOrdinanceSelectionState] = useState<{
    results: OrdinanceSearchResult[]
    query: { lawName: string }
  } | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean
    jo?: string
  }>({ isOpen: false })
  const [summaryDialog, setSummaryDialog] = useState<{
    isOpen: boolean
    jo?: string
    oldContent?: string
    newContent?: string
    effectiveDate?: string
  }>({ isOpen: false })
  const [mobileView, setMobileView] = useState<"list" | "content">("content")
  const [articleNotFound, setArticleNotFound] = useState<{
    requestedJo: string
    lawTitle: string
    nearestArticles: LawArticle[]
    crossLawSuggestions: Array<{
      lawTitle: string
      lawId: string | null
      articleJo: string
    }>
  } | null>(null)
  const [searchResults, setSearchResults] = useState<{
    laws: LawSearchResult[]
    ordinances: OrdinanceSearchResult[]
    jo?: string
  }>({ laws: [], ordinances: [] })
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  // RAG 관련 상태 (Phase 3: 기존 시스템 통합)
  const [searchMode, setSearchMode] = useState<SearchMode>('basic')
  const [ragResults, setRagResults] = useState<any[]>([])
  const [ragAnswer, setRagAnswer] = useState<any>(null)
  const [ragLoading, setRagLoading] = useState(false)
  const [ragError, setRagError] = useState<string | null>(null)
  const [ragProgress, setRagProgress] = useState(0)

  // AI 답변 상태 (File Search RAG)
  const [aiAnswerContent, setAiAnswerContent] = useState<string>('')
  const [aiRelatedLaws, setAiRelatedLaws] = useState<any[]>([])
  const [isAiMode, setIsAiMode] = useState(false)
  const [fileSearchFailed, setFileSearchFailed] = useState(false) // 검색 실패 감지
  const [aiCitations, setAiCitations] = useState<any[]>([]) // File Search Citations
  const [userQuery, setUserQuery] = useState<string>('') // 사용자 질의

  // AI 모드 - 관련 법령 2단 비교 상태
  const [comparisonLaw, setComparisonLaw] = useState<{
    meta: LawMeta | null
    articles: LawArticle[]
    selectedJo?: string
  } | null>(null)
  const [isLoadingComparison, setIsLoadingComparison] = useState(false)

  // Progress 상태 (SearchResultView 내부 관리)
  const [searchStage, setSearchStage] = useState<'searching' | 'parsing' | 'streaming' | 'complete'>('searching')
  const [searchProgress, setSearchProgress] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCacheHit, setIsCacheHit] = useState(false)  // 캐시 히트 여부

  const { toast } = useToast()
  const { reportError } = useErrorReportStore()

  // Progress 업데이트 헬퍼 함수
  const updateProgress = useCallback((stage: 'searching' | 'parsing' | 'streaming' | 'complete', progress: number) => {
    setSearchStage(stage)
    setSearchProgress(progress)
    onProgressUpdate?.(stage, progress) // 부모에게도 알림 (isSearching 해제용)
  }, [onProgressUpdate])

  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      const joSet = new Set(favs.map((f) => f.jo))
      setFavorites(joSet)
    })

    const initialFavs = favoritesStore.getFavorites()
    const joSet = new Set(initialFavs.map((f) => f.jo))
    setFavorites(joSet)

    return unsubscribe
  }, [])

  // searchId로부터 데이터 복원 (History 이동 시 캐시 활용)
  useEffect(() => {
    let isSubscribed = true

    const loadSearchResult = async () => {
      try {
        const { getSearchResult } = await import('@/lib/search-result-store')
        const cached = await getSearchResult(searchId)

        if (!isSubscribed) return

        if (!cached) {
          debugLogger.warning('❌ 검색 결과 없음', { searchId })
          return
        }

        debugLogger.info('📦 IndexedDB에서 데이터 복원', {
          query: cached.query,
          hasLawData: !!cached.lawData
        })

        // 검색 쿼리 저장 (Progress Dialog 표시용)
        setSearchQuery(cached.query.lawName || '')

        // lawData가 캐시되어 있으면 바로 복원 (API 호출 없음)
        if (cached.lawData) {
          debugLogger.success('✅ lawData 캐시 HIT - API 호출 없음', {
            lawTitle: cached.lawData.meta.lawName,
            articles: cached.lawData.articles.length,
          })

          // ⚡ 캐시 로딩 표시 (0.3초만 표시)
          setIsCacheHit(true)
          setIsSearching(true)
          updateProgress('parsing', 90)

          setLawData({
            meta: {
              lawId: cached.lawData.meta.lawId || '',
              lawTitle: cached.lawData.meta.lawName,
              latestEffectiveDate: '',
              promulgation: { date: '', number: '' },
              revisionType: '',
              fetchedAt: new Date().toISOString(),
              mst: cached.lawData.meta.mst,
            },
            articles: cached.lawData.articles.map(a => ({
              jo: a.joNumber,
              joNum: a.joLabel,
              title: '',
              content: a.content,
              isPreamble: false,
            })),
            selectedJo: cached.lawData.selectedJo || undefined,
            isOrdinance: cached.lawData.isOrdinance,
            viewMode: cached.lawData.viewMode || 'full',
            searchQueryId: cached.lawData.searchQueryId,
            searchResultId: cached.lawData.searchResultId,
          })

          // ⚡ 캐시 로딩 표시 (0.8초)
          setTimeout(() => {
            setIsCacheHit(false)
            setIsSearching(false)
            updateProgress('complete', 100)
          }, 800)
        } else {
          // lawData가 없으면 검색 실행
          debugLogger.info('📡 lawData 없음 - 검색 시작', cached.query)

          // 검색 실행 (비동기)
          setIsSearching(true)
          updateProgress('searching', 20)
          // ✅ await 추가 - 검색이 완료될 때까지 대기
          await handleSearchInternal(cached.query)
        }
      } catch (error) {
        if (!isSubscribed) return
        debugLogger.error('❌ 검색 결과 로드 실패', error)
      }
    }

    if (searchId) {
      loadSearchResult()
    }

    return () => {
      isSubscribed = false
    }
  }, [searchId])

  const fetchLawContent = async (
    selectedLaw: LawSearchResult,
    query: { lawName: string; article?: string; jo?: string },
  ) => {
    console.log("[v0] ========== FETCHING LAW CONTENT ==========")
    debugLogger.info("법령 ID 확인", { lawId: selectedLaw.lawId, lawName: selectedLaw.lawName })

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    try {
      updateProgress('parsing', 80)
      const params = new URLSearchParams()

      if (selectedLaw.lawId) {
        params.append("lawId", selectedLaw.lawId)
      } else if (selectedLaw.mst) {
        params.append("mst", selectedLaw.mst)
      } else {
        throw new Error("선택한 법령에 대한 식별자를 찾을 수 없습니다")
      }

      // IndexedDB 캐시 체크
      const { getLawContentCache, setLawContentCache } = await import('@/lib/law-content-cache')

      // effectiveDate를 모르므로 빈 문자열로 시도 (캐시에는 lawId만으로도 조회 가능)
      const lawContentCache = await getLawContentCache(selectedLaw.lawId || '', '')

      let meta
      let articles

      if (lawContentCache) {
        updateProgress('parsing', 90)
        debugLogger.success('💾 법령 본문 캐시 HIT (IndexedDB)', {
          lawTitle: lawContentCache.lawTitle,
          articles: lawContentCache.articles.length,
        })

        meta = lawContentCache.meta
        articles = lawContentCache.articles
      } else {
        updateProgress('parsing', 85)
        debugLogger.info('📄 법령 전문 조회 중 (eflaw API)', { lawId: selectedLaw.lawId })

        const apiUrl = "/api/eflaw?" + params.toString()
        const response = await fetch(apiUrl)

        apiLogs.push({
          url: apiUrl,
          method: "GET",
          status: response.status,
        })

        if (!response.ok) {
          const errorText = await response.text()
          apiLogs[apiLogs.length - 1].response = errorText
          throw new Error("법령 조회 실패")
        }

        const jsonText = await response.text()
        apiLogs[apiLogs.length - 1].response = jsonText.substring(0, 500) + "..."

        updateProgress('parsing', 90)
        const jsonData = JSON.parse(jsonText)
        const parsedData = parseLawJSON(jsonData)
        meta = parsedData.meta
        articles = parsedData.articles
        updateProgress('parsing', 95)

        // IndexedDB에 캐시 저장
        setLawContentCache(
          selectedLaw.lawId || '',
          meta.latestEffectiveDate || '',
          meta,
          articles
        ).catch((error) => {
          console.error('법령 본문 캐시 저장 실패:', error)
        })

        debugLogger.success('💾 법령 본문 캐시 저장 완료', {
          lawTitle: meta.lawTitle,
          effectiveDate: meta.latestEffectiveDate,
        })
      }

      let selectedJo: string | undefined
      const viewMode: "single" | "full" = query.jo ? "single" : "full"

      if (query.jo) {
        console.log(`🔍 [조문 검색] 요청: jo=${query.jo}, 전체 조문 수: ${articles.length}`)

        // Debug: Show sample JO codes
        const sampleJos = articles.slice(0, 10).map(a => a.jo).join(', ')
        console.log(`   샘플 JO 코드 (처음 10개): ${sampleJos}`)

        // Check if any "조의" articles exist
        const branchArticles = articles.filter(a => a.jo.endsWith('02') || a.jo.endsWith('03') || a.jo.endsWith('04'))
        if (branchArticles.length > 0) {
          console.log(`   조의 조문 발견: ${branchArticles.length}개`, branchArticles.slice(0, 5).map(a => `${a.jo}(${a.joNum})`).join(', '))
        }

        const targetArticle = articles.find((a) => a.jo === query.jo)
        console.log(`   조문 검색 결과: ${targetArticle ? '✅ 발견' : '❌ 없음'}`)

        if (targetArticle) {
          selectedJo = targetArticle.jo
        } else {
          // Article not found - find nearest articles and auto-select the closest one
          const { findNearestArticles } = await import('@/lib/article-finder')

          const nearestArticles = findNearestArticles(query.jo, articles)

          if (nearestArticles.length > 0) {
            // 가장 가까운 조문을 자동 선택
            selectedJo = nearestArticles[0].jo
            console.log(`⚠️ [기본 검색] 조문 없음, 유사 조문 자동 선택: ${nearestArticles[0].joNum}`)
            debugLogger.warning(`조문 없음: ${query.jo} → 유사 조문 표시: ${nearestArticles[0].joNum}`)
          } else {
            console.warn(`❌ [기본 검색] 조문 없음, 유사 조문도 없음: jo=${query.jo}`)
            debugLogger.warning(`조문 없음: ${query.jo}`)
          }

          // Store suggestions and show banner (auto-select closest, but show alternatives)
          setArticleNotFound({
            requestedJo: query.jo,
            lawTitle: meta.lawTitle,
            nearestArticles,
            crossLawSuggestions: [], // 다른 법령 추천은 서버 사이드에서만 가능
          })
        }
      }

      const finalLawData = {
        meta,
        articles,
        selectedJo,
        viewMode,
      }

      setLawData(finalLawData)

      const contentSource = lawContentCache ? "IndexedDB 캐시" : "eflaw API"
      debugLogger.success(`✅ 법령 본문 로드 완료 (${contentSource})`, {
        lawTitle: meta.lawTitle,
        articleCount: articles.length,
        searchSource: "L4 새 검색"
      })

      // 🔄 lawData를 IndexedDB에 즉시 저장 (앞으로가기 시 재로딩 방지)
      try {
        const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
        const currentState = window.history.state
        const currentSearchId = currentState?.searchId

        debugLogger.info('💾 lawData 저장 시도', {
          currentSearchId,
          hasHistoryState: !!currentState,
          lawTitle: meta.lawTitle
        })

        if (currentSearchId) {
          const existingCache = await getSearchResult(currentSearchId)

          if (existingCache) {
            await saveSearchResult({
              ...existingCache,
              lawData: {
                meta: {
                  lawId: selectedLaw.lawId || meta.lawId,  // meta.lawId를 fallback으로 사용
                  mst: selectedLaw.mst,
                  lawName: meta.lawTitle,
                },
                articles: articles.map(a => ({
                  joNumber: a.jo,
                  joLabel: a.joNum,
                  content: a.content,
                  isDeleted: false,
                })),
                selectedJo: selectedJo || null,
                isOrdinance: false,
                viewMode: viewMode,
              },
            })
            debugLogger.success('💾 lawData를 IndexedDB에 저장 완료', {
              searchId: currentSearchId,
              lawTitle: meta.lawTitle,
              articlesCount: articles.length
            })
          } else {
            debugLogger.warning('⚠️ existingCache 없음', { currentSearchId })
          }
        } else {
          debugLogger.warning('⚠️ currentSearchId 없음')
        }
      } catch (cacheError) {
        debugLogger.error('⚠️ lawData 저장 실패', cacheError)
      }

      // 🚀 Phase 2: 성공한 검색 자동 학습 - API 라우트 사용
      try {
        debugLogger.info('📚 검색 학습 중...', { lawName: meta.lawTitle })

        const rawQuery = query.article ? `${query.lawName} ${query.article}` : query.lawName

        const learningResponse = await fetch('/api/search-learning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawQuery,
            apiResult: {
              lawId: selectedLaw.lawId,
              mst: selectedLaw.mst,
              lawTitle: meta.lawTitle,
              effectiveDate: meta.latestEffectiveDate,
              articleContent: articles[0]?.content || '',
              articles,
              isOrdinance: false,
            },
          }),
        })

        if (learningResponse.ok) {
          const learningResult = await learningResponse.json()
          const hasValidIds = !!(learningResult.queryId && learningResult.resultId)

          debugLogger.success('✅ 검색 학습 완료 (DB 저장)', {
            queryId: learningResult.queryId,
            resultId: learningResult.resultId,
            hasValidIds,
            피드백버튼표시: hasValidIds ? '예' : '아니오',
            다음검색부터: 'L1-L3 캐시 활성화'
          })

          // ID를 lawData에 업데이트
          setLawData(prev => prev ? {
            ...prev,
            searchQueryId: learningResult.queryId,
            searchResultId: learningResult.resultId,
          } : null)
        } else {
          // 학습 실패 시 에러 상세 정보 읽기
          let errorDetails = null
          try {
            errorDetails = await learningResponse.json()
          } catch (e) {
            errorDetails = { error: '응답 파싱 실패' }
          }

          // 임시 ID 생성 (음수 타임스탬프로 구분)
          const tempQueryId = -Date.now()
          const tempResultId = -(Date.now() + 1)

          debugLogger.error('❌ 학습 API 실패, 임시 ID 생성', {
            status: learningResponse.status,
            statusText: learningResponse.statusText,
            error: errorDetails?.error,
            details: errorDetails?.details,
            tempQueryId,
            tempResultId,
            피드백버튼표시: '예 (임시 ID)',
          })

          // 임시 ID로 피드백 버튼 표시
          setLawData(prev => prev ? {
            ...prev,
            searchQueryId: tempQueryId,
            searchResultId: tempResultId,
          } : null)
        }
      } catch (learnError: any) {
        // 네트워크 에러 등으로 학습 실패 시에도 임시 ID 생성
        const tempQueryId = -Date.now()
        const tempResultId = -(Date.now() + 1)

        debugLogger.error('❌ 학습 예외 발생, 임시 ID 생성', {
          error: learnError?.message || String(learnError),
          errorType: learnError?.name,
          tempQueryId,
          tempResultId,
          피드백버튼표시: '예 (임시 ID)',
        })

        // 임시 ID로 피드백 버튼 표시
        setLawData(prev => prev ? {
          ...prev,
          searchQueryId: tempQueryId,
          searchResultId: tempResultId,
        } : null)
      }

      // ✅ 법령 콘텐츠 로딩 완료
      updateProgress('complete', 100)

      // (lawData 저장은 handleSearch 완료 시점에 통합 처리됨)
    } catch (error) {
      reportError(
        "법령 조회",
        error instanceof Error ? error : new Error(String(error)),
        {
          selectedLaw,
          query,
        },
        apiLogs,
      )
      throw error
    }
  }

  const handleSearchInternal = async (query: { lawName: string; article?: string; jo?: string }) => {
    // 검색 모드 초기화 (기본 검색으로 시작)
    setSearchMode('basic')
    onModeChange?.('basic')

    // 🤖 자동 자연어 검색 감지
    const fullQuery = query.article ? `${query.lawName} ${query.article}` : query.lawName
    const queryDetection = detectQueryType(fullQuery)

    debugLogger.info('🔍 검색 타입 감지', {
      query: fullQuery,
      type: queryDetection.type,
      confidence: queryDetection.confidence,
      reason: queryDetection.reason
    })

    // 자연어로 판단되면 File Search API를 호출하여 AI 답변을 받고 법령뷰로 표시
    if (queryDetection.type === 'natural' && queryDetection.confidence >= 0.7) {
      debugLogger.success('✨ 자연어 검색 감지 → AI 답변 모드', {
        query: fullQuery,
        confidence: queryDetection.confidence
      })

      // 사용자 질의 저장 (법령명 추론에 사용)
      setUserQuery(fullQuery)

      setIsSearching(true)
      setIsAiMode(true)
      setSearchMode('rag')  // RAG 검색 모드 활성화 (검색창 글로우 효과 및 버튼 스타일 적용)
      onModeChange?.('rag')  // 부모에게 모드 변경 알림
      updateProgress('searching', 20)

      // AI 답변을 위한 File Search API 호출
      try {
        updateProgress('parsing', 40)

        const response = await fetch('/api/file-search-rag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: fullQuery })
        })

        if (!response.ok) {
          throw new Error('File Search API 호출 실패')
        }

        updateProgress('streaming', 60)

        // SSE 스트리밍 읽기
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('Response body 읽기 실패')
        }

        let buffer = ''
        let fullContent = ''
        let receivedCitations: any[] = []
        let progressValue = 60

        // ✅ 스트리밍 중에는 UI 업데이트 하지 않음 - 모두 수집만 함
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
                continue
              }

              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'text') {
                  fullContent += parsed.text
                  // ✅ 진행률만 업데이트 (60% → 95%)
                  progressValue = Math.min(progressValue + 1, 95)
                  updateProgress('streaming', progressValue)
                } else if (parsed.type === 'citations') {
                  // Citations 데이터 수신
                  receivedCitations = parsed.citations || []
                  debugLogger.info('📚 Citations 수신', {
                    count: receivedCitations.length,
                    citations: receivedCitations
                  })
                }
              } catch (e) {
                // 파싱 에러 무시
              }
            }
          }
        }

        // ✅ 스트리밍 완료 후 한번에 처리
        const processedContent = fullContent.replace(/\^/g, ' ')

        // 검색 실패 감지 (프롬프트에서 정의한 실패 메시지 패턴)
        const searchFailed = processedContent.includes('File Search Store에서') &&
                            processedContent.includes('찾을 수 없습니다')
        setFileSearchFailed(searchFailed)

        if (searchFailed) {
          debugLogger.warning('⚠️ File Search 검색 실패 감지', {
            query: fullQuery,
            contentPreview: processedContent.substring(0, 200)
          })
        }

        // AI 답변에서 관련 법령 추출
        const relatedLaws = extractRelatedLaws(processedContent)

        debugLogger.success('✅ AI 답변 완료', {
          contentLength: processedContent.length,
          relatedLaws: relatedLaws.length,
          citationsReceived: receivedCitations.length,
          citationDetails: receivedCitations.map(c => ({
            lawName: c.lawName,
            articleNum: c.articleNum,
            source: c.source
          }))
        })

        // ✅ 모든 데이터 수집 완료 후 상태 업데이트
        setAiAnswerContent(processedContent)
        setAiRelatedLaws(relatedLaws)
        setAiCitations(receivedCitations)

        // 더미 lawData 설정 (법령뷰 표시를 위해)
        const aiLawData = {
          meta: {
            lawId: 'ai-answer',
            lawTitle: 'AI 답변',
            promulgationDate: new Date().toISOString().split('T')[0],
            lawType: 'AI',
            isOrdinance: false
          },
          articles: [], // AI 모드에서는 조문 목록 대신 관련 법령 표시
          selectedJo: undefined,
          isOrdinance: false
        }

        setLawData(aiLawData)
        setMobileView("content")

        // ✅ 프로그레스 완료
        updateProgress('complete', 100)
        setIsSearching(false)

      } catch (error) {
        debugLogger.error('❌ File Search API 오류', error)
        setIsSearching(false)
        updateProgress('complete', 0)
        setIsAiMode(false)
        toast({
          title: "AI 검색 실패",
          description: error instanceof Error ? error.message : "AI 답변을 가져오는 데 실패했습니다.",
          variant: "destructive"
        })
      }

      return
    }

    // 기본 구조화 검색 계속 진행
    setIsSearching(true)
    updateProgress('searching', 10)
    setLawData(null)
    setLawSelectionState(null)
    setOrdinanceSelectionState(null)
    setSearchResults({ laws: [], ordinances: [] })
    setArticleNotFound(null) // 이전 검색의 "조문 없음" 메시지 제거
    setAiAnswerContent('') // AI 답변 초기화
    setAiRelatedLaws([])
    setIsAiMode(false)
    setFileSearchFailed(false) // 검색 실패 상태 초기화
    setComparisonLaw(null) // 비교 법령 초기화
    setIsLoadingComparison(false)

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    const isOrdinanceQuery = /조례|규칙|특별시|광역시|도|시|군|구/.test(query.lawName)
    const lawName = query.lawName
    const articleNumber = query.article
    const jo = query.jo

    debugLogger.info(isOrdinanceQuery ? "조례 검색 시작" : "법령 검색 시작", { lawName, articleNumber, jo })

    // 🚀 Phase 7: IndexedDB 우선 체크 (법령만)
    if (!isOrdinanceQuery) {
      const rawQuery = `${query.lawName}${query.article ? ` ${query.article}` : ''}`

      try {
        updateProgress('searching', 30)
        const t0 = performance.now()
        const { getLawContentCacheByQuery } = await import('@/lib/law-content-cache')
        const cachedContent = await getLawContentCacheByQuery(rawQuery)
        const t1 = performance.now()

        if (cachedContent) {
          updateProgress('parsing', 70)
          debugLogger.success(`💾 [Phase 7] IndexedDB 캐시 HIT (${Math.round(t1 - t0)}ms) - API 호출 없음!`, {
            lawTitle: cachedContent.lawTitle,
            articles: cachedContent.articles.length,
          })

          // 조문 존재 확인 (Phase 7 버그 수정)
          let selectedJo: string | undefined = undefined

          if (query.jo) {
            // 실제로 조문이 있는지 확인
            const targetArticle = cachedContent.articles.find(a => a.jo === query.jo)
            if (targetArticle) {
              selectedJo = targetArticle.jo
              console.log(`✅ [Phase 7] 조문 발견: ${targetArticle.joNum}`)
            } else {
              // 조문 없음 처리 - 가장 유사한 조문을 자동으로 선택
              const { findNearestArticles } = await import('@/lib/article-finder')
              const nearestArticles = findNearestArticles(query.jo, cachedContent.articles)

              if (nearestArticles.length > 0) {
                // 가장 가까운 조문을 자동 선택
                selectedJo = nearestArticles[0].jo
                console.log(`⚠️ [Phase 7] 조문 없음, 유사 조문 자동 선택: ${nearestArticles[0].joNum}`)
                debugLogger.warning(`조문 없음: ${query.jo} → 유사 조문 표시: ${nearestArticles[0].joNum}`)
              } else {
                console.warn(`❌ [Phase 7] 조문 없음, 유사 조문도 없음: jo=${query.jo}`)
                debugLogger.warning(`조문 없음: ${query.jo}`)
              }

              // 배너로 안내 메시지 표시 (가장 가까운 조문을 보여주되, 다른 대안도 제시)
              setArticleNotFound({
                requestedJo: query.jo,
                lawTitle: cachedContent.meta.lawTitle,
                nearestArticles,
                crossLawSuggestions: [],
              })
            }
          }

          // 임시 ID 생성 (피드백 버튼용)
          const queryId = -Date.now()
          const resultId = -(Date.now() + 1)

          setLawData({
            meta: cachedContent.meta,
            articles: cachedContent.articles,
            selectedJo,
            viewMode: 'full',
            searchQueryId: queryId,
            searchResultId: resultId,
          })

          setIsSearching(false)
          updateProgress('complete', 100)
          return // ← 여기서 종료! API 호출 없음!
        } else {
          debugLogger.info(`❌ [Phase 7] IndexedDB 캐시 MISS (${Math.round(t1 - t0)}ms) - 기본 검색 진행`)
        }
      } catch (error) {
        debugLogger.warning('[Phase 7] IndexedDB 캐시 조회 실패, 기본 검색으로 진행', error)
      }

      // ⚠️ Phase 5/6 (Intelligent Search) 일시 비활성화
      // 학습 시스템이 잘못된 법령을 반환하는 문제 때문에 기본 검색으로 복귀
      console.log('⚠️ Phase 5/6 비활성화 - 기본 검색 사용')

      // intelligent-search 주석 처리 시작
      /* ===== Phase 5 비활성화 =====
      try {
        const intelligentResponse = await fetch('/api/intelligent-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawQuery }),
        })

        if (intelligentResponse.ok) {
          const intelligentResult = await intelligentResponse.json()

          if (intelligentResult.success && intelligentResult.data) {
            const sourceLayer = intelligentResult.source.replace(/_/g, ' ').toUpperCase()
            debugLogger.success(`✅ ${sourceLayer} 캐시 HIT (${intelligentResult.time}ms)`, {
              queryId: intelligentResult.searchQueryId,
              resultId: intelligentResult.searchResultId,
            })

            // 캐시된 데이터로 LawViewer 렌더링
            try {
              const cachedData = intelligentResult.data

              // 법령 내용 가져오기 (캐시에 lawId가 있으면)
              if (cachedData.lawId) {
                // IndexedDB 캐시 체크
                const t1 = performance.now()
                const { getLawContentCache, setLawContentCache } = await import('@/lib/law-content-cache')
                const effectiveDate = cachedData.effectiveDate || ''

                const lawContentCache = await getLawContentCache(cachedData.lawId, effectiveDate)
                const t2 = performance.now()

                let parsedData
                if (lawContentCache) {
                  debugLogger.success(`💾 법령 본문 캐시 HIT (IndexedDB, ${Math.round(t2 - t1)}ms)`, {
                    lawTitle: lawContentCache.lawTitle,
                    articles: lawContentCache.articles.length,
                  })

                  parsedData = {
                    meta: lawContentCache.meta,
                    articles: lawContentCache.articles,
                    selectedJo: query.jo,
                  }
                } else {
                  const t3 = performance.now()
                  debugLogger.info('📄 법령 전문 조회 중 (eflaw API)', { lawId: cachedData.lawId })

                  const apiUrl = `/api/eflaw?lawId=${cachedData.lawId}${cachedData.mst ? `&MST=${cachedData.mst}` : ''}`
                  const response = await fetch(apiUrl)

                  if (!response.ok) {
                    throw new Error('법령 전문 조회 실패')
                  }

                  const jsonText = await response.text()
                  const jsonData = JSON.parse(jsonText)
                  parsedData = parseLawJSON(jsonData)
                  const t4 = performance.now()
                  debugLogger.info(`📄 법령 전문 조회 완료 (${Math.round(t4 - t3)}ms)`)

                  // Phase 7: IndexedDB에 캐시 저장 (검색어 키 포함!)
                  setLawContentCache(
                    cachedData.lawId,
                    effectiveDate,
                    parsedData.meta,
                    parsedData.articles,
                    rawQuery  // Phase 7: 검색어 전달!
                  ).then(() => {
                    debugLogger.info('💾 [Phase 7] 법령 본문 캐시 저장 완료 (검색어 키 포함)', {
                      lawTitle: parsedData.meta.lawTitle,
                      key: `${cachedData.lawId}_${effectiveDate}`,
                      searchKey: `query:${rawQuery}`
                    })
                  }).catch((error) => {
                    console.error('법령 본문 캐시 저장 실패:', error)
                  })
                }

                // Check if requested article exists
                let finalData = { ...parsedData }
                if (query.jo && parsedData.selectedJo === undefined) {
                  console.log(`🔍 [Phase 5 - 조문 검색] 요청: jo=${query.jo}, 전체 조문 수: ${parsedData.articles.length}`)

                  // Debug: Show sample JO codes
                  const sampleJos = parsedData.articles.slice(0, 10).map(a => a.jo).join(', ')
                  console.log(`   샘플 JO 코드 (처음 10개): ${sampleJos}`)

                  // Check if any "조의" articles exist
                  const branchArticles = parsedData.articles.filter(a => a.jo.endsWith('02') || a.jo.endsWith('03') || a.jo.endsWith('04'))
                  if (branchArticles.length > 0) {
                    console.log(`   조의 조문 발견: ${branchArticles.length}개`, branchArticles.slice(0, 5).map(a => `${a.jo}(${a.joNum})`).join(', '))
                  }

                  const t5 = performance.now()
                  const { findNearestArticles } = await import('@/lib/article-finder')

                  const nearestArticles = findNearestArticles(query.jo, parsedData.articles)
                  const t6 = performance.now()

                  // Store suggestions and show banner
                  setArticleNotFound({
                    requestedJo: query.jo,
                    lawTitle: parsedData.meta.lawTitle,
                    nearestArticles,
                    crossLawSuggestions: [], // 다른 법령 추천은 서버 사이드에서만 가능
                  })

                  debugLogger.warning(`조문 없음: ${query.jo}, 제안 생성 (${Math.round(t6 - t5)}ms): ${nearestArticles.length}개`)
                }

                // 학습 실패 시 임시 ID 생성
                let queryId = intelligentResult.searchQueryId
                let resultId = intelligentResult.searchResultId

                if (!queryId || !resultId) {
                  queryId = -Date.now()
                  resultId = -(Date.now() + 1)
                  debugLogger.warning('⚠️ 학습 데이터 없음, 임시 ID 생성', {
                    tempQueryId: queryId,
                    tempResultId: resultId,
                    피드백버튼표시: '예 (임시 ID)',
                  })
                }

                const hasValidIds = !!(queryId && resultId)
                const contentSourceName = lawContentCache ? "IndexedDB 캐시" : "eflaw API"

                debugLogger.success(`✅ 검색 완료 (${sourceLayer} + ${contentSourceName})`, {
                  lawTitle: parsedData.meta.lawTitle,
                  articleCount: parsedData.articles.length,
                  searchCache: intelligentResult.source,
                  contentCache: lawContentCache ? 'HIT' : 'MISS',
                  totalTime: `${intelligentResult.time}ms (검색만)`,
                  queryId,
                  resultId,
                  hasValidIds,
                  피드백버튼표시: hasValidIds ? '예' : '아니오',
                })

                setLawData({
                  ...finalData,
                  searchQueryId: queryId,
                  searchResultId: resultId,
                })
                setMobileView("content")
                setIsSearching(false)
                updateProgress('complete', 100)
                return
              }
            } catch (error) {
              debugLogger.warning('캐시 데이터 활용 실패, 기존 로직으로 폴백', error)
            }
          }
        }
      } catch (error) {
        debugLogger.warning('Intelligent search API 호출 실패, 기존 로직으로 폴백', error)
      }
    }
    ===== Phase 5 비활성화 끝 ===== */

    // Phase 5 건너뛰고 바로 기본 검색으로 진행
    } // Phase 7 종료

    // === 기본 검색 시작 ===
    try {
      updateProgress('searching', 40)
      if (isOrdinanceQuery) {
        const apiUrl = "/api/ordin-search?query=" + encodeURIComponent(lawName)
        const response = await fetch(apiUrl)

        apiLogs.push({
          url: apiUrl,
          method: "GET",
          status: response.status,
        })

        if (!response.ok) {
          const errorText = await response.text()
          apiLogs[apiLogs.length - 1].response = errorText
          throw new Error("조례 검색 실패")
        }

        updateProgress('parsing', 60)
        const xmlText = await response.text()
        apiLogs[apiLogs.length - 1].response = xmlText.substring(0, 500) + "..."
        const results = parseOrdinanceSearchXML(xmlText)
        updateProgress('parsing', 80)

        if (results.length === 0) {
          // 조례는 벡터 검색 미지원 (Phase 5/6는 법령만)
          reportError(
            "조례 검색",
            new Error(`검색 결과를 찾을 수 없습니다: ${query.lawName}`),
            {
              query: query.lawName,
              searchType: "조례",
              resultCount: 0,
            },
            apiLogs,
          )
          updateProgress('complete', 0)
          setIsSearching(false)
          return
        }

        setOrdinanceSelectionState({
          results,
          query: { lawName },
        })
        setMobileView("list")
        updateProgress('complete', 100)
        setIsSearching(false)
      } else {
        const apiUrl = "/api/law-search?query=" + encodeURIComponent(lawName)
        const response = await fetch(apiUrl)

        apiLogs.push({
          url: apiUrl,
          method: "GET",
          status: response.status,
        })

        if (!response.ok) {
          const errorText = await response.text()
          apiLogs[apiLogs.length - 1].response = errorText
          throw new Error("법령 검색 실패")
        }

        updateProgress('parsing', 60)
        const xmlText = await response.text()
        apiLogs[apiLogs.length - 1].response = xmlText.substring(0, 500) + "..."
        const results = parseLawSearchXML(xmlText)
        updateProgress('parsing', 70)

        if (results.length === 0) {
          // 벡터 검색은 search-strategy.ts에서 처리됨 (Phase 5/6)

          reportError(
            "법령 검색",
            new Error("검색 결과를 찾을 수 없습니다"),
            {
              query: query.lawName,
              searchType: "법령",
              resultCount: 0,
            },
            apiLogs,
          )
          updateProgress('complete', 0)
          setIsSearching(false)
          return
        }

        const normalizedLawName = lawName.replace(/\s+/g, "")

        console.log(`🔍 [법령 검색] 검색어: "${lawName}", 결과: ${results.length}개`)
        console.log(`   결과 목록:`, results.slice(0, 5).map(r => r.lawName).join(', '))

        // 1. 정확히 일치하는 법령 찾기
        let exactMatch = results.find((r) => r.lawName.replace(/\s+/g, "") === normalizedLawName)
        console.log(`   정확 매칭: ${exactMatch ? exactMatch.lawName : '없음'}`)

        // 2. 유사도 기반 매칭 (정확한 매칭이 없을 때만)
        if (!exactMatch) {
          const { findMostSimilar } = await import('@/lib/text-similarity')

          // 시행령/시행규칙 제외하고 검색
          const mainLawResults = results.filter(
            (r) => !r.lawName.includes("시행령") && !r.lawName.includes("시행규칙")
          )

          // 검색어 길이에 따라 임계값 조정
          // 짧은 검색어(2글자 이하)는 매우 높은 유사도(85%)만 허용
          // 긴 검색어(3글자 이상)는 60% 유사도 허용
          const minSimilarity = normalizedLawName.length <= 2 ? 0.85 : 0.6

          const bestMatch = findMostSimilar(
            normalizedLawName,
            mainLawResults,
            (r) => r.lawName.replace(/\s+/g, ""),
            minSimilarity,
          )

          if (bestMatch) {
            exactMatch = bestMatch.item
            console.log(`   유사도 매칭: ${exactMatch.lawName} (유사도: ${(bestMatch.similarity * 100).toFixed(0)}%, 임계값: ${(minSimilarity * 100).toFixed(0)}%)`)
          } else {
            console.log(`   유사도 매칭: 없음 (최소 ${(minSimilarity * 100).toFixed(0)}% 필요)`)
          }
        }

        // 3. 매칭 실패 시 사용자에게 선택하도록 제안
        if (!exactMatch && results.length > 0) {
          console.warn(`⚠️ [법령 검색] "${lawName}"의 정확한 매칭 실패, 사용자 선택 필요`)
          console.log(`   제안 목록:`, results.map(r => r.lawName).join(', '))

          // 여러 결과 중 선택하도록 UI 표시
          setLawSelectionState({
            results: results,
            query: query,
          })
          updateProgress('complete', 100)
          setIsSearching(false)
          return
        }

        if (exactMatch && !jo) {
          try {
            await fetchLawContent(exactMatch, { lawName, article: articleNumber, jo: undefined })
            setMobileView("content")
            return
          } catch (error) {
            console.error("[v0] 법령 조회 오류:", error)
            toast({
              title: "법령 조회 실패",
              description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.",
              variant: "destructive",
            })
          }
        }

        if (exactMatch && jo) {
          try {
            await fetchLawContent(exactMatch, { lawName, article: articleNumber, jo })
            setMobileView("content")
          } catch (error) {
            console.error("[v0] 법령 조회 오류:", error)
            toast({
              title: "법령 조회 실패",
              description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.",
              variant: "destructive",
            })
          } finally {
            // onProgressUpdate already called in fetchLawContent
            setIsSearching(false)
          }
          return
        }

        setLawSelectionState({
          results,
          query: { lawName, article: articleNumber, jo },
        })
        setMobileView("list")
        updateProgress('complete', 100)
        setIsSearching(false)
      }
    } catch (error) {
      console.error("[v0] 검색 오류:", error)

      reportError(
        isOrdinanceQuery ? "조례 검색" : "법령 검색",
        error instanceof Error ? error : new Error(String(error)),
        {
          query,
          isOrdinanceQuery,
        },
        apiLogs,
      )

      toast({
        title: "검색 실패",
        description: error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.",
        variant: "destructive",
      })
      setLawData(null)
    } finally {
      setIsSearching(false)
      updateProgress('complete', 100)
    }
  }

  // Public handleSearch wrapper
  const handleSearch = (query: { lawName: string; article?: string; jo?: string }) => {
    handleSearchInternal(query)
  }

  const handleLawSelect = async (law: LawSearchResult) => {
    if (!lawSelectionState) return

    setIsSearching(true)
    try {
      await fetchLawContent(law, {
        lawName: lawSelectionState.query.lawName,
        article: lawSelectionState.query.article,
        jo: undefined,
      })
      setLawSelectionState(null)
      setMobileView("content")
    } catch (error) {
      debugLogger.error("법령 조회 실패", error)

      toast({
        title: "법령 조회 실패",
        description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleOrdinanceSelect = async (ordinance: OrdinanceSearchResult) => {
    if (!ordinanceSelectionState) return

    debugLogger.info("자치법규 선택", { ordinSeq: ordinance.ordinSeq, ordinName: ordinance.ordinName })

    setIsSearching(true)

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    try {
      const params = new URLSearchParams()
      if (ordinance.ordinId) {
        params.append("ordinId", ordinance.ordinId)
      } else {
        params.append("ordinSeq", ordinance.ordinSeq)
      }

      const apiUrl = "/api/ordin?" + params.toString()
      const response = await fetch(apiUrl)

      apiLogs.push({
        url: apiUrl,
        method: "GET",
        status: response.status,
      })

      if (!response.ok) {
        const errorText = await response.text()
        apiLogs[apiLogs.length - 1].response = errorText
        toast({
          title: "자치법규 조회 실패",
          description: "자치법규 본문을 불러올 수 없습니다.",
          variant: "destructive",
        })
        throw new Error("자치법규 조회 실패")
      }

      const xmlText = await response.text()
      apiLogs[apiLogs.length - 1].response = xmlText.substring(0, 500) + "..."

      const parsedData = parseOrdinanceXML(xmlText)
      const meta = parsedData.meta
      const articles = parsedData.articles

      if (articles.length === 0) {
        toast({
          title: "조문 없음",
          description: "이 자치법규의 조문을 찾을 수 없습니다.",
          variant: "destructive",
        })
      }

      setLawData({
        meta,
        articles,
        selectedJo: undefined,
        isOrdinance: true,
        viewMode: "full",
      })

      setOrdinanceSelectionState(null)
      setMobileView("content")
      debugLogger.success("자치법규 조회 완료", { ordinName: meta.lawTitle, articleCount: articles.length })
    } catch (error) {
      debugLogger.error("자치법규 조회 실패", error)

      reportError(
        "자치법규 조회",
        error instanceof Error ? error : new Error(String(error)),
        {
          ordinance,
        },
        apiLogs,
      )

      toast({
        title: "자치법규 조회 실패",
        description: error instanceof Error ? error.message : "자치법규 조회 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleRecentSelect = (search: any) => {
    debugLogger.info("최근 검색 선택", search)

    let jo: string | undefined
    if (search.article) {
      try {
        jo = buildJO(search.article)
      } catch (error) {
        console.error("[v0] Failed to convert article to jo:", error)
      }
    }

    handleSearch({
      lawName: search.lawName,
      article: search.article,
      jo,
    })
  }

  const handleFavoriteSelect = (favorite: Favorite) => {
    debugLogger.info("즐겨찾기 선택", favorite)
    handleSearch({
      lawName: favorite.lawTitle,
      jo: favorite.jo,
    })
  }

  // File Search RAG 핸들러 (SSE 스트리밍)
  const handleFileSearchRag = async (query: string) => {
    setRagLoading(true)
    setRagError(null)
    setRagAnswer(null)
    setRagProgress(0)

    // 프로그레스 애니메이션 (가짜 진행률)
    const progressInterval = setInterval(() => {
      setRagProgress((prev) => {
        if (prev >= 90) return prev
        return prev + 10
      })
    }, 300)

    try {
      debugLogger.info('📡 File Search RAG 시작', { query })

      const response = await fetch('/api/file-search-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        throw new Error('File Search RAG 요청 실패')
      }

      setRagProgress(30)

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('스트림을 읽을 수 없습니다')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let citations: any[] = []

      setRagProgress(50)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              setRagLoading(false)
              continue
            }

            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'text') {
                fullContent += parsed.text
                // 텍스트를 받을 때마다 조금씩 진행률 증가
                setRagProgress((prev) => Math.min(prev + 5, 95))
              } else if (parsed.type === 'citations') {
                citations = parsed.citations || []
              }
            } catch (e) {
              console.error('SSE 파싱 오류:', e)
            }
          }
        }
      }

      clearInterval(progressInterval)
      setRagProgress(100)

      // RagAnswerCard 형식으로 변환
      const formattedAnswer = {
        content: fullContent,
        citations: citations.map((c: any) => ({
          lawName: c.lawName || '알 수 없음',
          articleDisplay: c.articleNum || '',
          relevance: 'high' as const
        })),
        confidence: 'high' as const
      }

      setRagAnswer(formattedAnswer)
      debugLogger.success('✅ File Search RAG 완료', {
        contentLength: fullContent.length,
        citationsCount: citations.length
      })

    } catch (error) {
      clearInterval(progressInterval)
      const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류'
      debugLogger.error('❌ File Search RAG 오류', { error: errorMsg })
      setRagError(errorMsg)
      setRagProgress(0)
    } finally {
      setRagLoading(false)
    }
  }

  // RAG 검색 핸들러 (Phase 3: 기존 시스템 통합)
  const handleRagSearch = async (query: string, options: SearchOptions) => {
    setRagLoading(true)
    setRagError(null)
    setRagResults([])
    setRagAnswer(null)

    try {
      // 1. 벡터 검색
      debugLogger.info('RAG 검색 시작', { query, options })

      const searchUrl = `/api/rag-search?query=${encodeURIComponent(query)}&limit=${options.limit}&threshold=${options.threshold}${options.lawFilter ? `&lawFilter=${encodeURIComponent(options.lawFilter)}` : ''}`
      const searchRes = await fetch(searchUrl)

      if (!searchRes.ok) {
        throw new Error(`검색 실패: ${searchRes.status}`)
      }

      const searchData = await searchRes.json()

      if (!searchData.success) {
        throw new Error(searchData.error || '검색 실패')
      }

      debugLogger.success('RAG 검색 완료', {
        results: searchData.results.length,
        tokens: searchData.metadata.embeddingTokens,
      })

      setRagResults(searchData.results)

      // 2. AI 답변 생성 (검색 결과가 있는 경우)
      if (searchData.results.length > 0) {
        debugLogger.info('AI 답변 생성 시작')

        const answerRes = await fetch('/api/rag-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            context: searchData.results.map((r: any) => ({
              lawName: r.lawName,
              articleDisplay: r.articleDisplay,
              articleContent: r.articleContent,
              similarity: r.similarity,
            })),
          }),
        })

        if (!answerRes.ok) {
          throw new Error(`답변 생성 실패: ${answerRes.status}`)
        }

        const answerData = await answerRes.json()

        if (!answerData.success) {
          throw new Error(answerData.error || '답변 생성 실패')
        }

        debugLogger.success('AI 답변 생성 완료', {
          tokens: answerData.metadata.tokensUsed,
        })

        setRagAnswer(answerData.answer)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류'
      debugLogger.error('RAG 검색 오류', { error: errorMsg })
      setRagError(errorMsg)
    } finally {
      setRagLoading(false)
    }
  }

  // AI 모드 - 관련 법령 클릭 핸들러 (2단 비교 표시)
  const handleCitationClick = async (lawName: string, jo: string, article: string) => {
    // AI 답변은 유지하고, 클릭한 법령을 2단 비교로 표시
    debugLogger.info('관련 법령 클릭', { lawName, jo, article })

    try {
      setIsLoadingComparison(true)

      // 1. 법령 검색 (lawId 획득)
      const searchUrl = `/api/law-search?query=${encodeURIComponent(lawName)}`
      debugLogger.info('법령 검색 API 호출', { url: searchUrl })

      const searchRes = await fetch(searchUrl)
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
      const eflawUrl = `/api/eflaw?lawId=${lawId}`
      debugLogger.info('법령 전문 API 호출', { url: eflawUrl })

      const eflawRes = await fetch(eflawUrl)
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
        articleCount: articles.length,
        targetJo: jo
      })

      // 3. 비교 법령 상태 설정 (2단 비교 활성화)
      setComparisonLaw({
        meta,
        articles,
        selectedJo: jo
      })

      setIsLoadingComparison(false)

    } catch (err) {
      debugLogger.error('관련 법령 로드 실패', err)
      console.error('Failed to load related law:', err)
      setIsLoadingComparison(false)
      toast({
        title: "법령 로드 실패",
        description: err instanceof Error ? err.message : '법령을 불러올 수 없습니다',
        variant: "destructive"
      })
    }
  }

  const handleCompare = (jo: string) => {
    debugLogger.info("신·구법 비교 요청", { jo })
    setComparisonModal({ isOpen: true, jo })
  }

  const handleSummarize = async (jo: string) => {
    if (!lawData) return

    debugLogger.info("AI 요약 요청", { jo })

    try {
      const params = new URLSearchParams()
      if (lawData.meta.lawId) {
        params.append("lawId", lawData.meta.lawId)
      } else if (lawData.meta.mst) {
        params.append("mst", lawData.meta.mst)
      }

      const response = await fetch("/api/oldnew?" + params.toString())
      if (!response.ok) {
        throw new Error("신·구법 데이터 조회 실패")
      }

      const xmlText = await response.text()

      // ✅ FIX: 전체 XML 파싱 (targetJo 전달 안함 - ComparisonModal과 동일)
      const comparison = parseOldNewXML(xmlText)

      const article = lawData.articles.find((a) => a.jo === jo)
      const joNum = article ? article.joNum : jo

      debugLogger.success("✅ 신·구법 데이터 파싱 완료 (전체)", {
        joNum,
        oldContentLength: comparison.oldVersion.content.length,
        newContentLength: comparison.newVersion.content.length,
      })

      // 빈 내용 체크
      if (!comparison.oldVersion.content && !comparison.newVersion.content) {
        toast({
          title: "신·구법 데이터 없음",
          description: "해당 조문의 신·구법 비교 데이터를 찾을 수 없습니다.",
          variant: "destructive"
        })
        return
      }

      setSummaryDialog({
        isOpen: true,
        jo: joNum,
        oldContent: comparison.oldVersion.content,
        newContent: comparison.newVersion.content,
        effectiveDate: lawData.meta.latestEffectiveDate,
      })

      debugLogger.success("✅ AI 요약 다이얼로그 열림", { joNum })
    } catch (error) {
      debugLogger.error("❌ AI 요약 준비 실패", error)
      toast({
        title: "AI 요약 실패",
        description: error instanceof Error ? error.message : "AI 요약 준비 중 오류가 발생했습니다.",
        variant: "destructive"
      })
    }
  }

  const handleToggleFavorite = (jo: string) => {
    if (!lawData) return

    const article = lawData.articles.find((a) => a.jo === jo)
    if (!article) return

    try {
      if (favorites.has(jo)) {
        const existingFavs = favoritesStore.getFavorites()
        const toRemove = existingFavs.find((f) => f.lawTitle === lawData.meta.lawTitle && f.jo === jo)
        if (toRemove) {
          favoritesStore.removeFavorite(toRemove.id)
        }
      } else {
        favoritesStore.addFavorite({
          lawId: lawData.meta.lawId,
          mst: lawData.meta.mst,
          lawTitle: lawData.meta.lawTitle,
          jo,
          effectiveDate: lawData.meta.latestEffectiveDate,
          lastSeenSignature: (lawData.meta.latestEffectiveDate || "") + "-" + (lawData.meta.revisionType || ""),
        })
      }
    } catch (error) {
      reportError("즐겨찾기 토글", error instanceof Error ? error : new Error(String(error)), {
        lawTitle: lawData.meta.lawTitle,
        jo,
        action: favorites.has(jo) ? "제거" : "추가",
      })

      toast({
        title: "즐겨찾기 실패",
        description: "즐겨찾기 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    }
  }

  const handleReset = () => {
    setLawData(null)
    setLawSelectionState(null)
    setOrdinanceSelectionState(null)
    setSearchResults({ laws: [], ordinances: [] })
    setMobileView("content")
    setSearchMode('basic') // 기본 검색 모드로 복귀
    setRagResults([])
    setRagAnswer(null)
    setRagError(null)
    onBack() // 메인 화면으로 돌아가기
  }

  const handleFavoritesClick = () => {
    setFavoritesDialogOpen(true)
  }

  const handleSettingsClick = () => {
    window.location.href = '/admin/settings'
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* 프로그레스 Dialog (SearchResultView 내부) */}
      <SearchProgressDialog
        isOpen={isSearching}
        mode={searchMode === 'rag' ? 'ai' : 'law'}
        stage={searchStage}
        progress={searchProgress}
        lawName={searchQuery}
        isCacheHit={isCacheHit}
      />

      <Header onReset={handleReset} onFavoritesClick={handleFavoritesClick} onSettingsClick={handleSettingsClick} />
      <main className="flex-1">
        <div className="container mx-auto p-6">
          {lawSelectionState ? (
            <div className="py-4 md:py-8">
              {/* 헤더 섹션 - Glassmorphism */}
              <div className="sticky top-0 z-10 -mx-6 px-6 py-4 mb-8 bg-background/80 backdrop-blur-xl border-b border-border/50">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent" style={{ fontFamily: "Pretendard, sans-serif" }}>
                      법령 검색 결과
                    </h2>
                    <Badge
                      variant="secondary"
                      className="h-7 px-3 bg-primary/10 text-primary border border-primary/20 font-bold"
                      style={{ fontFamily: "Pretendard, sans-serif" }}
                    >
                      {lawSelectionState.results.length}건
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLawSelectionState(null)
                      setIsSearching(false)
                      updateProgress('complete', 0)
                    }}
                    className="hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    취소
                  </Button>
                </div>
              </div>

              {/* 검색 결과 그리드 - 애니메이션 적용 */}
              <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {lawSelectionState.results.map((law, index) => (
                  <button
                    key={law.lawId || law.mst}
                    onClick={() => handleLawSelect(law)}
                    className="group relative p-5 md:p-6 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden animate-fade-in"
                    style={{
                      animationDelay: `${index * 50}ms`,
                      fontFamily: "Pretendard, sans-serif"
                    }}
                  >
                    {/* 그라데이션 배경 (hover 시 나타남) */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* 콘텐츠 */}
                    <div className="relative flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* 법령명 + 타입 */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-base md:text-lg leading-snug mb-2 group-hover:text-primary transition-colors">
                              {String(law.lawName)}
                            </h4>
                            <Badge
                              variant="secondary"
                              className={`
                                text-xs font-semibold px-3 py-1
                                ${getLawTypeBadgeClass(String(law.lawType))}
                              `}
                            >
                              {String(law.lawType)}
                            </Badge>
                          </div>
                        </div>

                        {/* 메타 정보 */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
                          {law.promulgationDate && (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              공포: {String(law.promulgationDate)}
                            </span>
                          )}
                          {law.effectiveDate && (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              시행: {String(law.effectiveDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 화살표 아이콘 (hover 시 이동) */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
                        <ChevronLeft className="w-5 h-5 rotate-180 text-primary group-hover:text-primary-foreground transition-colors" />
                      </div>
                    </div>

                    {/* 하단 글로우 효과 */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </button>
                ))}
              </div>
            </div>
          ) : ordinanceSelectionState ? (
            <div className="py-4 md:py-8">
              {/* 헤더 섹션 - Glassmorphism */}
              <div className="sticky top-0 z-10 -mx-6 px-6 py-4 mb-8 bg-background/80 backdrop-blur-xl border-b border-border/50">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent" style={{ fontFamily: "Pretendard, sans-serif" }}>
                      조례 검색 결과
                    </h2>
                    <Badge
                      variant="secondary"
                      className="h-7 px-3 bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold"
                      style={{ fontFamily: "Pretendard, sans-serif" }}
                    >
                      {ordinanceSelectionState.results.length}건
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOrdinanceSelectionState(null)
                      setIsSearching(false)
                      updateProgress('complete', 0)
                    }}
                    className="hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    취소
                  </Button>
                </div>
              </div>

              {/* 검색 결과 그리드 - 애니메이션 적용 */}
              <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {ordinanceSelectionState.results.map((ordinance, index) => (
                  <button
                    key={ordinance.ordinSeq}
                    onClick={() => handleOrdinanceSelect(ordinance)}
                    className="group relative p-5 md:p-6 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden animate-fade-in"
                    style={{
                      animationDelay: `${index * 50}ms`,
                      fontFamily: "Pretendard, sans-serif"
                    }}
                  >
                    {/* 그라데이션 배경 (hover 시 나타남) */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* 콘텐츠 */}
                    <div className="relative flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* 조례명 + 타입 */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-base md:text-lg leading-snug mb-2 group-hover:text-blue-600 transition-colors">
                              {String(ordinance.ordinName)}
                            </h4>
                            {ordinance.ordinKind && (
                              <Badge
                                variant="secondary"
                                className="text-xs font-semibold px-3 py-1 bg-blue-500/10 text-blue-600 border border-blue-500/20"
                              >
                                {String(ordinance.ordinKind)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* 메타 정보 */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
                          {ordinance.orgName && (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                              {String(ordinance.orgName)}
                            </span>
                          )}
                          {ordinance.effectiveDate && (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              시행: {String(ordinance.effectiveDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 화살표 아이콘 (hover 시 이동) */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500 group-hover:scale-110 transition-all duration-300">
                        <ChevronLeft className="w-5 h-5 rotate-180 text-blue-600 group-hover:text-white transition-colors" />
                      </div>
                    </div>

                    {/* 하단 글로우 효과 */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </button>
                ))}
              </div>
            </div>
          ) : !lawData ? (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              {/* 로딩 애니메이션 */}
              <div className="relative">
                <div className="w-20 h-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <div className="absolute inset-0 w-20 h-20 border-4 border-transparent border-r-accent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              </div>

              {/* 로딩 텍스트 */}
              <div className="text-center space-y-2" style={{ fontFamily: "Pretendard, sans-serif" }}>
                <p className="text-lg font-semibold text-foreground">검색 데이터를 불러오는 중</p>
                <p className="text-sm text-muted-foreground">잠시만 기다려주세요...</p>
              </div>

              {/* 애니메이션 도트 */}
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="md:hidden">
                {mobileView === "content" && (
                  <Button variant="outline" size="sm" onClick={() => setMobileView("list")} className="mb-4 w-full">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    다른 법령 검색
                  </Button>
                )}

                {mobileView === "list" ? (
                  <div className="space-y-4">
                    <SearchBar onSearch={handleSearch} isLoading={isSearching} />
                    <Button variant="outline" size="sm" onClick={() => setMobileView("content")} className="w-full">
                      현재 법령으로 돌아가기
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {articleNotFound && (
                      <ArticleNotFoundBanner
                        requestedJo={articleNotFound.requestedJo}
                        lawTitle={articleNotFound.lawTitle}
                        nearestArticles={articleNotFound.nearestArticles}
                        crossLawSuggestions={articleNotFound.crossLawSuggestions}
                        onSelectArticle={(jo) => {
                          setLawData(prev => prev ? { ...prev, selectedJo: jo } : null)
                        }}
                        onSelectCrossLaw={(lawTitle) => {
                          handleSearch({ lawName: lawTitle, article: formatJO(articleNotFound.requestedJo) })
                        }}
                        onDismiss={() => setArticleNotFound(null)}
                      />
                    )}
                    {/* 피드백 버튼 제거됨 - 미사용 */}
                    <LawViewer
                      meta={lawData.meta}
                      articles={lawData.articles}
                      selectedJo={lawData.selectedJo}
                      viewMode={lawData.viewMode}
                      onCompare={handleCompare}
                      onSummarize={handleSummarize}
                      onToggleFavorite={handleToggleFavorite}
                      favorites={favorites}
                      isOrdinance={lawData.isOrdinance}
                      aiAnswerMode={isAiMode}
                      aiAnswerContent={aiAnswerContent}
                      relatedArticles={aiRelatedLaws}
                      onRelatedArticleClick={handleCitationClick}
                      fileSearchFailed={fileSearchFailed}
                      comparisonLawMeta={comparisonLaw?.meta || null}
                      comparisonLawArticles={comparisonLaw?.articles || []}
                      comparisonLawSelectedJo={comparisonLaw?.selectedJo}
                      isLoadingComparison={isLoadingComparison}
                      aiCitations={aiCitations}
                      userQuery={userQuery}
                    />
                  </div>
                )}
              </div>

              <div className="hidden md:block space-y-4">
                <SearchBar onSearch={handleSearch} isLoading={isSearching} />
                {articleNotFound && (
                  <ArticleNotFoundBanner
                    requestedJo={articleNotFound.requestedJo}
                    lawTitle={articleNotFound.lawTitle}
                    nearestArticles={articleNotFound.nearestArticles}
                    crossLawSuggestions={articleNotFound.crossLawSuggestions}
                    onSelectArticle={(jo) => {
                      setLawData(prev => prev ? { ...prev, selectedJo: jo } : null)
                    }}
                    onSelectCrossLaw={(lawTitle) => {
                      handleSearch({ lawName: lawTitle, article: formatJO(articleNotFound.requestedJo) })
                    }}
                    onDismiss={() => setArticleNotFound(null)}
                  />
                )}
                {/* 피드백 버튼 제거됨 - Phase 5/6 비활성화로 미사용 */}
                <LawViewer
                  meta={lawData.meta}
                  articles={lawData.articles}
                  selectedJo={lawData.selectedJo}
                  viewMode={lawData.viewMode}
                  onCompare={handleCompare}
                  onSummarize={handleSummarize}
                  onToggleFavorite={handleToggleFavorite}
                  favorites={favorites}
                  isOrdinance={lawData.isOrdinance}
                  aiAnswerMode={isAiMode}
                  aiAnswerContent={aiAnswerContent}
                  relatedArticles={aiRelatedLaws}
                  onRelatedArticleClick={handleCitationClick}
                  fileSearchFailed={fileSearchFailed}
                  comparisonLawMeta={comparisonLaw?.meta || null}
                  comparisonLawArticles={comparisonLaw?.articles || []}
                  comparisonLawSelectedJo={comparisonLaw?.selectedJo}
                  isLoadingComparison={isLoadingComparison}
                  aiCitations={aiCitations}
                  userQuery={userQuery}
                />
              </div>
            </div>
          )}
        </div>
      </main>
      {lawData && (
        <>
          <ComparisonModal
            isOpen={comparisonModal.isOpen}
            onClose={() => setComparisonModal({ isOpen: false })}
            lawTitle={lawData.meta.lawTitle}
            lawId={lawData.meta.lawId}
            mst={lawData.meta.mst}
            targetJo={comparisonModal.jo}
          />

          {summaryDialog.isOpen && summaryDialog.oldContent && summaryDialog.newContent && (
            <AISummaryDialog
              isOpen={summaryDialog.isOpen}
              onClose={() => setSummaryDialog({ isOpen: false })}
              lawTitle={lawData.meta.lawTitle}
              joNum={summaryDialog.jo || ""}
              oldContent={summaryDialog.oldContent}
              newContent={summaryDialog.newContent}
              effectiveDate={summaryDialog.effectiveDate}
            />
          )}
        </>
      )}
      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={handleFavoriteSelect}
      />
      <ErrorReportDialog />
      {!lawData && !lawSelectionState && !ordinanceSelectionState && (
        <footer className="border-t border-border py-6">
          <div className="container mx-auto px-6">
            <p className="text-center text-sm text-muted-foreground">© 2025 Chris ryu. All rights reserved.</p>
          </div>
        </footer>
      )}
    </div>
  )
}
