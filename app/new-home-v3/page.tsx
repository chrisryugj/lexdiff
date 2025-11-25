/**
 * app/new-home-v3/page.tsx
 *
 * 새로운 홈 화면 V3 (Organic Design by Claude)
 * - Warm, natural color palette (amber, orange, lime)
 * - Soft gradients and organic shapes
 * - Subtle grain texture overlay
 * - Smooth, natural animations
 */

"use client"

import { useState, useEffect } from "react"
import { OrganicHomeView } from "@/components/organic-home-view"
import { SearchResultView } from "@/components/search-result-view"
import { debugLogger } from "@/lib/debug-logger"
import { generateSearchId } from "@/lib/search-id-generator"
import { saveSearchResult, deleteExpiredResults } from "@/lib/search-result-store"
import {
    initializeHistory,
    pushSearchHistory,
    getCurrentHistoryState,
    onPopState,
    type HistoryState
} from "@/lib/history-manager"
import type { Favorite } from "@/lib/law-types"

type ViewMode = 'home' | 'search-result'

export default function NewHomeV3() {
    const [viewMode, setViewMode] = useState<ViewMode>('home')
    const [searchId, setSearchId] = useState<string | null>(null)
    const [isSearching, setIsSearching] = useState(false)
    const [ragLoading, setRagLoading] = useState(false)
    const [searchMode, setSearchMode] = useState<'basic' | 'rag'>('basic')

    // 프로그레스 상태 (SearchResultView에서 전달받음)
    const [searchStage, setSearchStage] = useState<'searching' | 'parsing' | 'streaming' | 'complete'>('searching')
    const [searchProgress, setSearchProgress] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')

    // 초기화: History API + IndexedDB 설정
    useEffect(() => {
        // 만료된 검색 결과 삭제
        deleteExpiredResults().catch(err => {
            console.error('Failed to delete expired results:', err)
        })

        // History API 초기화
        initializeHistory()

        // 현재 상태 확인
        const currentState = getCurrentHistoryState()

        if (currentState?.viewMode === 'search-result' && currentState.searchId) {
            // 새로고침 시 검색 결과 복원
            debugLogger.info('🔄 새로고침 감지: 검색 결과 복원', {
                searchId: currentState.searchId,
                timestamp: currentState.timestamp
            })

            setViewMode('search-result')
            setSearchId(currentState.searchId)
        }

        // popstate 이벤트 리스너 등록 (뒤로가기/앞으로가기)
        const unsubscribe = onPopState((state: HistoryState | null) => {
            // state가 null이거나 viewMode가 없으면 홈으로 이동
            if (!state || !state.viewMode) {
                debugLogger.info('⬅️ History 이동 (초기 상태 → 홈)', { state })
                setViewMode('home')
                setSearchId(null)
                setSearchMode('basic')
                setIsSearching(false)
                return
            }

            debugLogger.info('⬅️ History 이동', {
                viewMode: state.viewMode,
                searchId: state.searchId
            })

            if (state.viewMode === 'home') {
                setViewMode('home')
                setSearchId(null)
                setSearchMode('basic')
                setIsSearching(false)
            } else if (state.viewMode === 'search-result' && state.searchId) {
                setViewMode('search-result')
                setSearchId(state.searchId)
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

            // History 추가
            pushSearchHistory(newSearchId)

            // 화면 전환
            setSearchId(newSearchId)
            setViewMode('search-result')

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

    // 홈으로 돌아가기
    const handleBack = () => {
        debugLogger.info('🏠 홈으로 돌아가기')
        window.history.back()
    }

    return (
        <>
            {viewMode === 'home' ? (
                <OrganicHomeView
                    onSearch={handleSearch}
                    onFavoriteSelect={handleFavoriteSelect}
                    isSearching={isSearching}
                    ragLoading={ragLoading}
                    searchMode={searchMode}
                />
            ) : viewMode === 'search-result' && searchId ? (
                <SearchResultView
                    searchId={searchId}
                    onBack={handleBack}
                    onProgressUpdate={(stage, progress) => {
                        setSearchStage(stage)
                        setSearchProgress(progress)
                        if (stage === 'complete') {
                            setIsSearching(false)
                        }
                    }}
                    onModeChange={(mode) => {
                        setSearchMode(mode)
                    }}
                />
            ) : null}
        </>
    )
}
