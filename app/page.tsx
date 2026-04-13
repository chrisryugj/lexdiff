/**
 * app/page.tsx
 *
 * 메인 페이지 - IndexedDB + History API 방식
 * - URL은 항상 '/' 유지
 * - SearchView와 SearchResultView 조건부 렌더링
 * - F5 새로고침 시에도 검색 결과 유지
 */

"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { SearchView } from "@/components/search-view"
import { SearchResultView } from "@/components/search-result-view"
import { debugLogger } from "@/lib/debug-logger"
import { generateSearchId } from "@/lib/search-id-generator"
import { saveSearchResult, deleteExpiredResults } from "@/lib/search-result-store"
import {
  initializeHistory,
  pushSearchHistory,
  pushHomeHistory,
  pushImpactTrackerHistory,
  getCurrentHistoryState,
  onPopState,
  type HistoryState
} from "@/lib/history-manager"
import { favoritesStore } from "@/lib/favorites-store"
import type { Favorite } from "@/lib/law-types"
import type { SearchStage } from "@/components/search-result-view/types"
import type { ImpactTrackerRequest } from "@/lib/impact-tracker/types"
import { AiGateDialog } from "@/components/ai-gate-dialog"
import { useAiGate } from "@/hooks/use-ai-gate"
import type { LawMeta } from "@/lib/law-types"

// Dynamic imports: 초기 번들에서 제외 (사용자 액션 시에만 로드)
const ImpactTrackerView = dynamic(
  () => import("@/components/impact-tracker/impact-tracker-view").then(m => m.ImpactTrackerView),
  { ssr: false }
)
const OrdinanceBenchmarkView = dynamic(
  () => import("@/components/ordinance-benchmark/ordinance-benchmark-view").then(m => m.OrdinanceBenchmarkView),
  { ssr: false }
)
const ComparisonModal = dynamic(
  () => import("@/components/comparison-modal").then(m => m.ComparisonModal),
  { ssr: false }
)
const DelegationGapModal = dynamic(
  () => import("@/components/delegation-gap-modal").then(m => m.DelegationGapModal),
  { ssr: false }
)
const TimeMachineModal = dynamic(
  () => import("@/components/time-machine-modal").then(m => m.TimeMachineModal),
  { ssr: false }
)
const LawSelectionDialog = dynamic(
  () => import("@/components/law-selection-dialog").then(m => m.LawSelectionDialog),
  { ssr: false }
)

type ViewMode = 'home' | 'search-result' | 'precedent-detail' | 'impact-tracker' | 'ordinance-benchmark'

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('home')
  const [searchId, setSearchId] = useState<string | null>(null)
  const [precedentId, setPrecedentId] = useState<string | null>(null)  // 판례 상세 ID
  const [historyKey, setHistoryKey] = useState(0)  // 뒤로가기 시 강제 리마운트용
  const [isSearching, setIsSearching] = useState(false)
  const [ragLoading, setRagLoading] = useState(false)
  const [searchMode, setSearchMode] = useState<'basic' | 'rag'>('basic')
  const [impactRequest, setImpactRequest] = useState<ImpactTrackerRequest | null>(null)
  const [impactKey, setImpactKey] = useState(0) // 진입 시마다 증가 → 리마운트로 초기화
  const [benchmarkKeyword, setBenchmarkKeyword] = useState('')

  // 홈 도구 카드 → 법령 선택 다이얼로그 + 모달
  const [lawSelectionDialog, setLawSelectionDialog] = useState<{
    isOpen: boolean
    tool: 'delegation-gap' | 'time-machine' | null
  }>({ isOpen: false, tool: null })
  const [homeDelegationGap, setHomeDelegationGap] = useState<{ isOpen: boolean; meta: LawMeta | null }>({ isOpen: false, meta: null })
  const [homeTimeMachine, setHomeTimeMachine] = useState<{ isOpen: boolean; meta: LawMeta | null }>({ isOpen: false, meta: null })

  // 프로그레스 상태 (SearchResultView에서 전달받음)
  const [searchStage, setSearchStage] = useState<SearchStage>('searching')
  const [searchProgress, setSearchProgress] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  // 영향 추적기 신구법 비교 모달
  const [compareModal, setCompareModal] = useState<{
    isOpen: boolean
    lawTitle: string
    mst: string
  }>({ isOpen: false, lawTitle: '', mst: '' })

  // AI 인증 게이트 (Google 로그인)
  const { showGate, requireAuth, handleClose: handleGateClose } = useAiGate()

  // AI 게이트 이벤트 수신 (useAiSearch에서 게이트 미인증 시 발송)
  useEffect(() => {
    const handler = (e: Event) => {
      const query = (e as CustomEvent).detail?.query as string | undefined
      requireAuth(() => {
        if (query) handleSearch({ lawName: query })
      })
    }
    window.addEventListener('lexdiff:ai-gate-required', handler)
    return () => window.removeEventListener('lexdiff:ai-gate-required', handler)
  }, [requireAuth])

  // 초기화: History API + IndexedDB 설정
  useEffect(() => {
    // 만료된 검색 결과 삭제
    deleteExpiredResults().catch(err => {
      debugLogger.error('Failed to delete expired results:', err)
    })

    // History API 초기화
    initializeHistory()

    // 현재 상태 확인
    const currentState = getCurrentHistoryState()

    if (currentState?.viewMode === 'precedent-detail' && currentState.searchId && currentState.precedentId) {
      // 새로고침 시 판례 상세 복원
      debugLogger.info('🔄 새로고침 감지: 판례 상세 복원', {
        searchId: currentState.searchId,
        precedentId: currentState.precedentId,
        searchMode: currentState.searchMode,
        timestamp: currentState.timestamp
      })

      setViewMode('precedent-detail')
      setSearchId(currentState.searchId)
      setPrecedentId(currentState.precedentId)
      setSearchMode(currentState.searchMode || 'basic')
    } else if (currentState?.viewMode === 'search-result' && currentState.searchId) {
      // 새로고침 시 검색 결과 복원
      debugLogger.info('🔄 새로고침 감지: 검색 결과 복원', {
        searchId: currentState.searchId,
        searchMode: currentState.searchMode,
        timestamp: currentState.timestamp
      })

      setViewMode('search-result')
      setSearchId(currentState.searchId)
      setPrecedentId(null)
      setSearchMode(currentState.searchMode || 'basic')  // 검색 모드 복원
    }

    // popstate 이벤트 리스너 등록 (뒤로가기/앞으로가기)
    const unsubscribe = onPopState((state: HistoryState | null) => {
      // state가 null이거나 viewMode가 없으면 홈으로 이동
      if (!state || !state.viewMode) {
        debugLogger.info('⬅️ History 이동 (초기 상태 → 홈)', { state })
        setViewMode('home')
        setSearchId(null)
        setPrecedentId(null)
        setSearchMode('basic') // 홈으로 돌아오면 기본 모드로 초기화
        setIsSearching(false) // 검색 중 상태 초기화
        return
      }

      debugLogger.info('⬅️ History 이동', {
        viewMode: state.viewMode,
        searchId: state.searchId,
        precedentId: state.precedentId,
        searchMode: state.searchMode
      })

      if (state.viewMode === 'home') {
        setViewMode('home')
        setSearchId(null)
        setPrecedentId(null)
        setImpactRequest(null)
        setSearchMode('basic') // 홈으로 돌아오면 기본 모드로 초기화
        setIsSearching(false) // 검색 중 상태 초기화
      } else if (state.viewMode === 'impact-tracker') {
        setViewMode('impact-tracker')
        // key 변경 없음 → 기존 결과 보존
      } else if (state.viewMode === 'ordinance-benchmark') {
        setViewMode('ordinance-benchmark')
      } else if (state.viewMode === 'precedent-detail' && state.searchId && state.precedentId) {
        // 판례 상세 → 앞으로가기로 다시 판례 상세
        setViewMode('precedent-detail')
        setSearchId(state.searchId)
        setPrecedentId(state.precedentId)
        setSearchMode(state.searchMode || 'basic')
      } else if (state.viewMode === 'search-result' && state.searchId) {
        // 판례 상세 / 조례 상세 → 뒤로가기 → 검색 결과 리스트
        setViewMode('search-result')
        setSearchId(state.searchId)
        setPrecedentId(null)  // 판례 상세 초기화
        setSearchMode(state.searchMode || 'basic')
        setHistoryKey(prev => prev + 1)  // 같은 searchId여도 강제 리마운트
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // 검색 핸들러
  const handleSearch = async (query: { lawName: string; article?: string; jo?: string }) => {
    debugLogger.info('🔍 검색 시작', query)

    const newSearchId = generateSearchId()

    // 검색 쿼리 저장 (UI용)
    setSearchQuery(query.lawName)
    setIsSearching(true)
    setSearchStage('searching')
    setSearchProgress(10)

    // 검색 쿼리를 IndexedDB에 저장
    try {
      await saveSearchResult({
        searchId: newSearchId,
        query,
        timestamp: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7일
      })

      debugLogger.success('✅ 검색 ID 생성', { searchId: newSearchId })

      // History 추가 (검색 모드도 함께 저장)
      pushSearchHistory(newSearchId, searchMode)

      // 화면 전환 (프로그레스는 SearchResultView에서 관리)
      setSearchId(newSearchId)
      setViewMode('search-result')
      // isSearching은 SearchResultView의 onProgressUpdate에서 complete 시 false로 변경됨

    } catch (error) {
      debugLogger.error('❌ 검색 실패', error)
      setIsSearching(false)
    }
  }

  // 즐겨찾기 선택 핸들러
  const handleFavoriteSelect = (favorite: Favorite) => {
    debugLogger.info('⭐ 즐겨찾기 선택', favorite)
    handleSearch({
      lawName: favorite.lawTitle,
      jo: favorite.jo,
    })
  }

  // 뒤로가기 (히스토리 기반)
  const handleBack = () => {
    debugLogger.info('⬅️ 뒤로가기')
    window.history.back()
    // popstate 이벤트에서 상태 업데이트가 처리됨
  }

  // 영향 추적기 신구법 비교
  const handleImpactCompare = (lawName: string, mst: string) => {
    setCompareModal({ isOpen: true, lawTitle: lawName, mst })
  }

  // 영향 추적기 이동 (비밀번호 게이트 적용)
  const handleImpactTracker = () => {
    requireAuth(() => {
      pushImpactTrackerHistory({ lawNames: [], dateFrom: '', dateTo: '' })
      setViewMode('impact-tracker')
      setImpactKey(k => k + 1)
      setImpactRequest(null)
    })
  }

  // 법령 뷰어 → 영향 추적기 (법령명 자동 입력)
  const handleImpactTrackerFromViewer = (lawName: string, mode: 'impact' | 'ordinance-sync' = 'impact') => {
    requireAuth(() => {
      const today = new Date().toISOString().slice(0, 10)
      const monthsAgo = mode === 'ordinance-sync' ? 12 : 3
      const from = new Date()
      from.setMonth(from.getMonth() - monthsAgo)
      const request: ImpactTrackerRequest = {
        lawNames: [lawName],
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: today,
        mode,
      }
      pushImpactTrackerHistory(request)
      setViewMode('impact-tracker')
      setImpactKey(k => k + 1)
      setImpactRequest(request)
    })
  }

  // 조례 벤치마킹 이동
  const handleOrdinanceBenchmark = (lawName: string) => {
    setBenchmarkKeyword(lawName)
    setViewMode('ordinance-benchmark')
  }

  // 홈으로 직접 이동 (로고 클릭)
  const handleHomeClick = () => {
    debugLogger.info('🏠 홈으로 이동')
    pushHomeHistory()
    setViewMode('home')
    setSearchId(null)
    setPrecedentId(null)
    setImpactRequest(null)
    setSearchMode('basic')
    setIsSearching(false)
  }

  return (
    <>
      {/* viewMode에 따라 SearchView 또는 SearchResultView 표시 */}
      {/* 영향 추적기: key 변경 시 리마운트 → 초기화 */}
      {impactKey > 0 && (
        <div className={viewMode !== 'impact-tracker' ? 'hidden' : ''}>
          <ImpactTrackerView
            key={impactKey}
            initialRequest={impactRequest}
            onBack={() => window.history.back()}
            onHomeClick={handleHomeClick}
            onCompare={(lawName, _lawId, mst) => {
              handleImpactCompare(lawName, mst)
            }}
          />
        </div>
      )}

      {/* 조례 벤치마킹 */}
      {viewMode === 'ordinance-benchmark' && (
        <OrdinanceBenchmarkView
          initialKeyword={benchmarkKeyword}
          onBack={() => window.history.back()}
          onHomeClick={handleHomeClick}
        />
      )}

      {viewMode === 'home' ? (
        <SearchView
          onSearch={handleSearch}
          onFavoriteSelect={handleFavoriteSelect}
          isSearching={isSearching}
          ragLoading={ragLoading}
          searchMode={searchMode}
          onImpactTracker={handleImpactTracker}
          onToolClick={(toolId) => {
            switch (toolId) {
              case 'impact-tracker':
                handleImpactTracker()
                break
              case 'ordinance-sync':
                // 미반영 탐지: 영향 추적기를 ordinance-sync 모드로
                requireAuth(() => {
                  const today = new Date().toISOString().slice(0, 10)
                  const from = new Date()
                  from.setMonth(from.getMonth() - 12)
                  const request: ImpactTrackerRequest = {
                    lawNames: [],
                    dateFrom: from.toISOString().slice(0, 10),
                    dateTo: today,
                    mode: 'ordinance-sync',
                  }
                  pushImpactTrackerHistory(request)
                  setViewMode('impact-tracker')
                  setImpactKey(k => k + 1)
                  setImpactRequest(request)
                })
                break
              case 'ordinance-benchmark':
                handleOrdinanceBenchmark('')
                break
              case 'delegation-gap':
                setLawSelectionDialog({ isOpen: true, tool: 'delegation-gap' })
                break
              case 'time-machine':
                setLawSelectionDialog({ isOpen: true, tool: 'time-machine' })
                break
            }
          }}
        />
      ) : viewMode === 'impact-tracker' || viewMode === 'ordinance-benchmark' ? null : (viewMode === 'search-result' || viewMode === 'precedent-detail') && searchId ? (
        <SearchResultView
          key={`${searchId}-${historyKey}`}  // 뒤로가기 시 강제 리마운트
          searchId={searchId}
          onBack={handleBack}
          onHomeClick={handleHomeClick}
          initialSearchMode={searchMode}  // History에서 복원된 검색 모드 전달
          initialPrecedentId={precedentId}  // 판례 상세 ID (새로고침 복원용)
          onProgressUpdate={(stage, progress) => {
            setSearchStage(stage)
            setSearchProgress(progress)
            // 완료 시 즉시 프로그레스 숨김 (지연 제거)
            if (stage === 'complete') {
              setIsSearching(false)
            }
          }}
          onModeChange={(mode) => {
            setSearchMode(mode)
          }}
          onPrecedentSelect={(id) => {
            // 판례 선택/해제 시 React 상태도 동기화
            if (id) {
              setViewMode('precedent-detail')
              setPrecedentId(id)
            } else {
              setViewMode('search-result')
              setPrecedentId(null)
            }
          }}
          onImpactTracker={handleImpactTrackerFromViewer}
          onOrdinanceBenchmark={handleOrdinanceBenchmark}
        />
      ) : null}

      {/* 영향 추적기 신구법 비교 모달 */}
      <ComparisonModal
        isOpen={compareModal.isOpen}
        onClose={() => setCompareModal(prev => ({ ...prev, isOpen: false }))}
        lawTitle={compareModal.lawTitle}
        mst={compareModal.mst}
      />

      {/* 홈 도구 카드 → 법령 선택 다이얼로그 */}
      <LawSelectionDialog
        isOpen={lawSelectionDialog.isOpen}
        onClose={() => setLawSelectionDialog({ isOpen: false, tool: null })}
        title={lawSelectionDialog.tool === 'delegation-gap' ? '위임 미비 탐지 — 법령 선택' : '법령 타임머신 — 법령 선택'}
        description="분석할 법령을 검색하여 선택하세요."
        onSelect={(law) => {
          const meta: LawMeta = {
            lawTitle: law.lawName,
            lawId: law.lawId,
            mst: law.mst,
            fetchedAt: new Date().toISOString(),
            lawType: law.lawType,
          }
          if (lawSelectionDialog.tool === 'delegation-gap') {
            setHomeDelegationGap({ isOpen: true, meta })
          } else {
            setHomeTimeMachine({ isOpen: true, meta })
          }
        }}
      />

      {/* 홈 → 위임 미비 탐지 모달 */}
      {homeDelegationGap.isOpen && homeDelegationGap.meta && (
        <DelegationGapModal
          isOpen={homeDelegationGap.isOpen}
          onClose={() => setHomeDelegationGap({ isOpen: false, meta: null })}
          meta={homeDelegationGap.meta}
        />
      )}

      {/* 홈 → 타임머신 모달 */}
      {homeTimeMachine.isOpen && homeTimeMachine.meta && (
        <TimeMachineModal
          isOpen={homeTimeMachine.isOpen}
          onClose={() => setHomeTimeMachine({ isOpen: false, meta: null })}
          meta={homeTimeMachine.meta}
        />
      )}

      {/* AI 인증 게이트 (Google 로그인) */}
      <AiGateDialog
        open={showGate}
        onClose={handleGateClose}
      />
    </>
  )
}
