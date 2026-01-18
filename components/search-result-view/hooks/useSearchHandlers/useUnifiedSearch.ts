/**
 * useSearchHandlers/useUnifiedSearch.ts
 *
 * 통합검색 핸들러 (판례/해석례/재결례 + 페이지네이션)
 */

import { useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { parseOrdinanceSearchXML } from "@/lib/ordin-search-parser"
import type { HandlerDeps, SearchQuery } from "./types"

interface UseUnifiedSearchDeps extends HandlerDeps {
  handleSearch: (query: SearchQuery) => void
  handleSearchInternal: (query: SearchQuery, signal?: AbortSignal, forcedMode?: 'law' | 'ai', skipCache?: boolean) => Promise<void>
}

export function useUnifiedSearch(deps: UseUnifiedSearchDeps) {
  const { state, actions, toast, searchId, onPrecedentSelect, handleSearch, handleSearchInternal } = deps

  // ============================================================
  // 판례 검색
  // ============================================================
  const handlePrecedentSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 판례 검색 실행', { query })

    try {
      const classification = (query as any).classification
      const caseNumber = classification?.entities?.caseNumber
      const court = classification?.entities?.court
      const searchQuery = caseNumber || query.lawName || query.article || ''

      if (!searchQuery) {
        toast({
          title: "검색어 오류",
          description: "판례 검색어를 입력해주세요.",
          variant: "destructive"
        })
        return
      }

      // 판례 검색 모드로 명시적 설정 (AI 모드 비활성화)
      actions.setIsAiMode(false)
      actions.setSearchMode('basic')

      // 기존 법령/조례 검색 상태 초기화
      actions.setLawSelectionState(null)
      actions.setOrdinanceSelectionState(null)
      actions.setLawData(null)

      // 검색어 업데이트 (헤더 표시용)
      actions.setSearchQuery(searchQuery)
      actions.setUserQuery(searchQuery)

      // 로딩 상태로 전환
      actions.setIsSearching(true)

      // API 호출
      const params = new URLSearchParams({ query: searchQuery, display: String(state.precedentPageSize) })
      if (court) params.append('court', court)
      if (caseNumber) params.append('caseNumber', caseNumber)

      const apiUrl = `/api/precedent-search?${params.toString()}`
      debugLogger.info('[통합검색] 판례 API 호출', { url: apiUrl })

      const res = await fetch(apiUrl)

      if (!res.ok) {
        const errorText = await res.text()
        debugLogger.error('[통합검색] 판례 API 에러', { status: res.status, error: errorText })
        throw new Error(`판례 검색 실패: ${res.status}`)
      }

      const data = await res.json()
      debugLogger.info('[통합검색] 판례 API 응답', { data })

      // 결과 표시
      if (data.precedents && data.precedents.length > 0) {
        actions.setPrecedentResults(data.precedents)
        actions.setPrecedentTotalCount(data.totalCount || data.precedents.length)
        actions.setPrecedentPage(1)
        actions.setPrecedentYearFilter(data.yearFilter)
        actions.setPrecedentCourtFilter(data.courtFilter)

        // IndexedDB에 검색 결과 저장 (뒤로가기용)
        if (searchId) {
          const { getSearchResult, saveSearchResult } = await import('@/lib/search-result-store')
          const cached = await getSearchResult(searchId)
          if (cached) {
            await saveSearchResult({
              ...cached,
              precedentResults: data.precedents.map((p: any) => ({
                id: p.id,
                name: p.name,
                caseNumber: p.caseNumber,
                court: p.court,
                date: p.date,
                judgmentType: p.judgmentType
              })),
              precedentDetail: undefined
            })
          }
        }

        toast({
          title: "판례 검색 완료",
          description: `${data.precedents.length}건의 판례를 찾았습니다.`,
          variant: "default"
        })

        debugLogger.info('[통합검색] 판례 검색 결과', { count: data.precedents.length, results: data.precedents })
      } else {
        actions.setPrecedentResults([])

        toast({
          title: "검색 결과 없음",
          description: "판례를 찾을 수 없습니다.",
          variant: "default"
        })
      }
    } catch (error) {
      debugLogger.error('[통합검색] 판례 검색 실패', error)
      toast({
        title: "판례 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, searchId, state.precedentPageSize])

  // ============================================================
  // 판례 선택 (상세 보기)
  // ============================================================
  const handlePrecedentSelect = useCallback(async (precedentId: string) => {
    debugLogger.info('[통합검색] 판례 선택', { id: precedentId })

    try {
      actions.setIsSearching(true)
      actions.updateProgress('parsing', 50)

      const res = await fetch(`/api/precedent-detail?id=${precedentId}`)

      if (!res.ok) {
        throw new Error(`판례 조회 실패: ${res.status}`)
      }

      const precedent = await res.json()
      debugLogger.info('[통합검색] 판례 상세 조회 완료', { precedent })

      actions.updateProgress('parsing', 80)

      // 판례 내용을 법령 뷰어 형식으로 변환
      const { formatPrecedentDate } = await import('@/lib/precedent-parser')
      const { generateLinks } = await import('@/lib/unified-link-generator')

      const articles: Array<{ jo: string; joNum: string; content: string; title: string }> = []

      // HTML 태그 정리 함수
      const cleanHtml = (text: string) => {
        return text
          .replace(/<br\\>/g, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }

      // 링크 적용 함수
      const applyLinks = (text: string, enablePrecedents: boolean = false) => {
        let result = generateLinks(text, {
          mode: 'aggressive',
          enableSameRef: true,
          enableAdminRules: false,
          enablePrecedents,
        })

        if (enablePrecedents) {
          result = result.replace(
            /【\s*원심\s*판결\s*】[\s\S]*?(?=【|$)/gi,
            (section) => section.replace(
              /<a[^>]*class="[^"]*precedent-ref[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
              '$1'
            )
          )
        }

        return result
      }

      let sectionCounter = 1

      // 1. 판시사항
      if (precedent.holdings) {
        articles.push({
          jo: String(sectionCounter).padStart(6, '0'),
          joNum: '판시사항',
          content: applyLinks(cleanHtml(precedent.holdings), true),
          title: '판시사항'
        })
        sectionCounter++
      }

      // 2. 판결요지
      if (precedent.summary) {
        articles.push({
          jo: String(sectionCounter).padStart(6, '0'),
          joNum: '판결요지',
          content: applyLinks(cleanHtml(precedent.summary), true),
          title: '판결요지'
        })
        sectionCounter++
      }

      // 3. 참조조문
      if (precedent.refStatutes) {
        articles.push({
          jo: String(sectionCounter).padStart(6, '0'),
          joNum: '참조조문',
          content: applyLinks(cleanHtml(precedent.refStatutes), true),
          title: '참조조문'
        })
        sectionCounter++
      }

      // 4. 참조판례
      if (precedent.refPrecedents) {
        articles.push({
          jo: String(sectionCounter).padStart(6, '0'),
          joNum: '참조판례',
          content: applyLinks(cleanHtml(precedent.refPrecedents), true),
          title: '참조판례'
        })
        sectionCounter++
      }

      // 5. 전문 처리
      if (precedent.fullText) {
        const fullText = cleanHtml(precedent.fullText)
        const sectionPattern = /【([^】]+)】/g
        const sectionTitles: string[] = []
        let match

        while ((match = sectionPattern.exec(fullText)) !== null) {
          sectionTitles.push(match[1].trim())
        }

        if (sectionTitles.length > 0) {
          sectionTitles.forEach((title, idx) => {
            const startMarker = `【${title}】`
            const endMarker = idx < sectionTitles.length - 1 ? `【${sectionTitles[idx + 1]}】` : null

            const startIdx = fullText.indexOf(startMarker)
            if (startIdx === -1) return

            let content = endMarker
              ? fullText.substring(startIdx + startMarker.length, fullText.indexOf(endMarker))
              : fullText.substring(startIdx + startMarker.length)

            content = content.trim()
            if (content) {
              articles.push({
                jo: String(sectionCounter).padStart(6, '0'),
                joNum: title,
                content: applyLinks(content, true),
                title: title
              })
              sectionCounter++
            }
          })
        } else {
          articles.push({
            jo: String(sectionCounter).padStart(6, '0'),
            joNum: '판결문',
            content: applyLinks(fullText, true),
            title: '판결문'
          })
        }
      }

      const lawData = {
        meta: {
          lawId: `prec-${precedentId}`,
          lawTitle: precedent.name,
          promulgationDate: formatPrecedentDate(precedent.date),
          lawType: `${precedent.court} ${precedent.judgmentType}`,
          isOrdinance: false,
          fetchedAt: new Date().toISOString(),
          caseNumber: precedent.caseNumber
        },
        articles,
        selectedJo: undefined,
        viewMode: 'full' as const,
        isPrecedent: true
      }

      actions.setLawData(lawData)
      actions.setPrecedentResults(null)
      actions.setMobileView("content")
      actions.updateProgress('complete', 100)

      // 히스토리에 판례 상세 상태 추가
      if (searchId) {
        const { pushPrecedentHistory } = await import('@/lib/history-manager')
        pushPrecedentHistory(searchId, precedentId, state.searchMode)
        debugLogger.info('[통합검색] 판례 상세 히스토리 추가', { searchId, precedentId })

        // IndexedDB에 판례 상세 저장
        const { getSearchResult, saveSearchResult } = await import('@/lib/search-result-store')
        const cached = await getSearchResult(searchId)
        if (cached) {
          await saveSearchResult({
            ...cached,
            precedentDetail: {
              id: precedentId,
              lawData
            }
          })
        }

        onPrecedentSelect?.(precedentId)
      }

      // 최근 조회 판례 저장
      const { addRecentPrecedent } = await import('@/lib/recent-precedent-store')
      await addRecentPrecedent({
        id: precedentId,
        caseNumber: precedent.caseNumber || '',
        caseName: precedent.name || '',
        court: precedent.court || '',
        date: precedent.date || '',
      })

      debugLogger.success('[통합검색] 판례 뷰어 표시 완료')
    } catch (error) {
      debugLogger.error('[통합검색] 판례 조회 실패', error)
      toast({
        title: "판례 조회 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, searchId, state.searchMode, onPrecedentSelect])

  // ============================================================
  // 법령/판례 강제 새로고침
  // ============================================================
  const handleRefresh = useCallback(() => {
    if (!state.lawData) {
      toast({ title: "새로고침 실패", description: "데이터가 없습니다.", variant: "destructive" })
      return
    }
    debugLogger.info('🔄 법령/판례 강제 새로고침 (캐시 무시)', {
      lawTitle: state.lawData.meta.lawTitle,
      isPrecedent: state.lawData.isPrecedent,
      lawId: state.lawData.meta.lawId
    })

    if (state.lawData.isPrecedent && state.lawData.meta.lawId?.startsWith('prec-')) {
      const precedentId = state.lawData.meta.lawId.replace('prec-', '')
      debugLogger.info('🔄 판례 새로고침', { precedentId })
      handlePrecedentSelect(precedentId)
      return
    }

    handleSearchInternal(
      { lawName: state.lawData.meta.lawTitle },
      undefined,
      'law',
      true
    )
  }, [state.lawData, handleSearchInternal, handlePrecedentSelect, toast])

  // ============================================================
  // 해석례 검색
  // ============================================================
  const handleInterpretationSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 해석례 검색 실행', { query })

    try {
      const classification = (query as any).classification
      const ruleType = classification?.entities?.ruleType
      const lawName = classification?.entities?.lawName || query.lawName
      const searchQuery = lawName || query.article || ''

      if (!searchQuery) {
        toast({
          title: "검색어 오류",
          description: "해석례 검색어를 입력해주세요.",
          variant: "destructive"
        })
        return
      }

      actions.setIsAiMode(false)
      actions.setSearchMode('basic')
      actions.setLawSelectionState(null)
      actions.setOrdinanceSelectionState(null)
      actions.setLawData(null)
      actions.setSearchQuery(searchQuery)
      actions.setUserQuery(searchQuery)
      actions.setIsSearching(true)

      const params = new URLSearchParams({ query: searchQuery })
      if (ruleType) params.append('ruleType', ruleType)

      const res = await fetch(`/api/interpretation-search?${params.toString()}`)

      if (!res.ok) {
        throw new Error(`해석례 검색 실패: ${res.status}`)
      }

      const data = await res.json()

      if (data.interpretations && data.interpretations.length > 0) {
        toast({
          title: "⚠️ 해석례 검색 기능 준비 중",
          description: `${data.interpretations.length}건의 해석례를 찾았지만, 표시 화면이 아직 구현되지 않았습니다.`,
          variant: "default"
        })
        debugLogger.info('[통합검색] 해석례 검색 결과', { count: data.interpretations.length })
      } else {
        toast({
          title: "검색 결과 없음",
          description: "해석례를 찾을 수 없습니다.",
          variant: "default"
        })
      }

      actions.resetToHome()
    } catch (error) {
      debugLogger.error('[통합검색] 해석례 검색 실패', error)
      toast({
        title: "해석례 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions])

  // ============================================================
  // 재결례 검색
  // ============================================================
  const handleRulingSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 재결례 검색 실행', { query })

    try {
      const classification = (query as any).classification
      const rulingNumber = classification?.entities?.rulingNumber
      const searchQuery = rulingNumber || query.lawName || ''

      if (!searchQuery) {
        toast({
          title: "검색어 오류",
          description: "재결례 검색어를 입력해주세요.",
          variant: "destructive"
        })
        return
      }

      actions.setIsAiMode(false)
      actions.setSearchMode('basic')
      actions.setLawSelectionState(null)
      actions.setOrdinanceSelectionState(null)
      actions.setLawData(null)
      actions.setSearchQuery(searchQuery)
      actions.setUserQuery(searchQuery)
      actions.setIsSearching(true)

      const res = await fetch(`/api/ruling-search?query=${encodeURIComponent(searchQuery)}`)

      if (!res.ok) {
        throw new Error(`재결례 검색 실패: ${res.status}`)
      }

      const data = await res.json()

      if (data.rulings && data.rulings.length > 0) {
        toast({
          title: "재결례 검색 완료",
          description: `${data.rulings.length}건의 재결례를 찾았습니다.`,
          variant: "default"
        })
        debugLogger.info('[통합검색] 재결례 검색 결과', { count: data.rulings.length })
      } else {
        toast({
          title: "검색 결과 없음",
          description: "재결례를 찾을 수 없습니다.",
          variant: "default"
        })
      }
    } catch (error) {
      debugLogger.error('[통합검색] 재결례 검색 실패', error)
      toast({
        title: "재결례 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions])

  // ============================================================
  // 복합 검색
  // ============================================================
  const handleMultiSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 복합 검색 실행', { query })

    try {
      const classification = (query as any).classification
      const secondaryTypes = classification?.secondaryTypes || []

      if (secondaryTypes.length === 0) {
        toast({
          title: "복합 검색 오류",
          description: "검색 타입을 확인할 수 없습니다.",
          variant: "destructive"
        })
        return
      }

      actions.setIsSearching(true)

      toast({
        title: "복합 검색 시작",
        description: `${secondaryTypes.length}개 소스에서 검색 중...`,
        variant: "default"
      })

      const promises = secondaryTypes.map(async (type: string) => {
        switch (type) {
          case 'law':
            return handleSearch(query)
          case 'precedent':
            return handlePrecedentSearch(query)
          case 'interpretation':
            return handleInterpretationSearch(query)
          case 'ruling':
            return handleRulingSearch(query)
          default:
            return Promise.resolve()
        }
      })

      await Promise.all(promises)

      debugLogger.info('[통합검색] 복합 검색 완료', { types: secondaryTypes })
    } catch (error) {
      debugLogger.error('[통합검색] 복합 검색 실패', error)
      toast({
        title: "복합 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, handleSearch, handlePrecedentSearch, handleInterpretationSearch, handleRulingSearch])

  // ============================================================
  // 판례 페이지네이션
  // ============================================================
  const handlePrecedentPageChange = useCallback(async (page: number) => {
    debugLogger.info('[판례] 페이지 변경', { page })

    try {
      actions.setIsSearching(true)
      actions.setPrecedentPage(page)

      const params = new URLSearchParams({
        query: state.userQuery || '',
        page: page.toString(),
        display: String(state.precedentPageSize)
      })

      const res = await fetch(`/api/precedent-search?${params.toString()}`)

      if (!res.ok) {
        throw new Error(`판례 검색 실패: ${res.status}`)
      }

      const data = await res.json()

      actions.setPrecedentResults(data.precedents || [])
      actions.setPrecedentTotalCount(data.totalCount || 0)
      actions.setPrecedentYearFilter(data.yearFilter)
      actions.setPrecedentCourtFilter(data.courtFilter)

    } catch (error) {
      debugLogger.error('[판례] 페이지 변경 실패', error)
      toast({
        title: "페이지 로드 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, state.userQuery, state.precedentPageSize])

  const handlePrecedentPageSizeChange = useCallback(async (size: number) => {
    debugLogger.info('[판례] 페이지 크기 변경', { size })

    try {
      actions.setIsSearching(true)
      actions.setPrecedentPageSize(size)
      actions.setPrecedentPage(1)

      const params = new URLSearchParams({
        query: state.userQuery || '',
        page: '1',
        display: size.toString()
      })

      const res = await fetch(`/api/precedent-search?${params.toString()}`)

      if (!res.ok) {
        throw new Error(`판례 검색 실패: ${res.status}`)
      }

      const data = await res.json()

      actions.setPrecedentResults(data.precedents || [])
      actions.setPrecedentTotalCount(data.totalCount || 0)
      actions.setPrecedentYearFilter(data.yearFilter)
      actions.setPrecedentCourtFilter(data.courtFilter)

    } catch (error) {
      debugLogger.error('[판례] 페이지 크기 변경 실패', error)
      toast({
        title: "로드 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, state.userQuery])

  // ============================================================
  // 조례 페이지네이션
  // ============================================================
  const handleOrdinancePageChange = useCallback(async (newPage: number) => {
    if (!state.ordinanceSelectionState) return

    try {
      actions.setIsSearching(true)
      actions.setOrdinancePage(newPage)

      const { lawName } = state.ordinanceSelectionState.query
      const apiUrl = `/api/ordin-search?query=${encodeURIComponent(lawName)}&display=${state.ordinancePageSize}&page=${newPage}`

      const response = await fetch(apiUrl)
      if (!response.ok) throw new Error("조례 검색 실패")

      const xmlText = await response.text()
      const { totalCount, ordinances } = parseOrdinanceSearchXML(xmlText)

      console.log(`[ordin-page-change] 페이지 ${newPage}: totalCount=${totalCount}, ordinances.length=${ordinances.length}`)

      actions.setOrdinanceSelectionState({
        results: ordinances,
        totalCount,
        query: { lawName }
      })
    } catch (error) {
      debugLogger.error('[조례] 페이지 변경 실패', error)
      toast({
        title: "페이지 로드 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, state.ordinanceSelectionState, state.ordinancePageSize])

  const handleOrdinancePageSizeChange = useCallback(async (newSize: number) => {
    if (!state.ordinanceSelectionState) return

    try {
      actions.setIsSearching(true)
      actions.setOrdinancePageSize(newSize)
      actions.setOrdinancePage(1)

      const { lawName } = state.ordinanceSelectionState.query
      const apiUrl = `/api/ordin-search?query=${encodeURIComponent(lawName)}&display=${newSize}&page=1`

      const response = await fetch(apiUrl)
      if (!response.ok) throw new Error("조례 검색 실패")

      const xmlText = await response.text()
      const { totalCount, ordinances } = parseOrdinanceSearchXML(xmlText)

      console.log(`[ordin-size-change] ${newSize}개씩: totalCount=${totalCount}, ordinances.length=${ordinances.length}`)

      actions.setOrdinanceSelectionState({
        results: ordinances,
        totalCount,
        query: { lawName }
      })
    } catch (error) {
      debugLogger.error('[조례] 페이지 크기 변경 실패', error)
      toast({
        title: "로드 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, state.ordinanceSelectionState])

  return {
    handlePrecedentSearch,
    handlePrecedentSelect,
    handleRefresh,
    handleInterpretationSearch,
    handleRulingSearch,
    handleMultiSearch,
    handlePrecedentPageChange,
    handlePrecedentPageSizeChange,
    handleOrdinancePageChange,
    handleOrdinancePageSizeChange,
  }
}
