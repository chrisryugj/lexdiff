/**
 * useSearchHandlers/useFetchLawContent.ts
 *
 * 법령 본문 조회 훅
 */

import { useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { parseLawJSON } from "@/lib/law-json-parser"
import type { HandlerDeps, SearchQuery, LawSearchResult, LawDataState } from "./types"

export function useFetchLawContent(deps: HandlerDeps) {
  const { actions, reportError } = deps

  const fetchLawContent = useCallback(async (
    selectedLaw: LawSearchResult,
    query: SearchQuery,
    skipCache?: boolean,
  ) => {
    debugLogger.info("법령 ID 확인", { lawId: selectedLaw.lawId, lawName: selectedLaw.lawName })

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    try {
      actions.updateProgress('parsing', 80)
      const params = new URLSearchParams()

      if (selectedLaw.lawId) {
        params.append("lawId", selectedLaw.lawId)
      } else if (selectedLaw.mst) {
        params.append("mst", selectedLaw.mst)
      } else {
        throw new Error("선택한 법령에 대한 식별자를 찾을 수 없습니다")
      }

      // IndexedDB 캐시 체크 (skipCache 시 무시)
      const { getLawContentCache, setLawContentCache } = await import('@/lib/law-content-cache')
      const lawContentCache = skipCache ? null : await getLawContentCache(selectedLaw.lawId || '', '')

      let meta
      let articles

      if (lawContentCache) {
        actions.updateProgress('parsing', 90)
        debugLogger.success('💾 법령 본문 캐시 HIT (IndexedDB)', {
          lawTitle: lawContentCache.lawTitle,
          articles: lawContentCache.articles.length,
        })

        meta = lawContentCache.meta
        articles = lawContentCache.articles
      } else {
        actions.updateProgress('parsing', 85)
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

        actions.updateProgress('parsing', 90)
        const jsonData = JSON.parse(jsonText)
        const parsedData = parseLawJSON(jsonData)
        meta = parsedData.meta
        articles = parsedData.articles
        actions.updateProgress('parsing', 95)

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
        const targetArticle = articles.find((a) => a.jo === query.jo)

        if (targetArticle) {
          selectedJo = targetArticle.jo
        } else {
          const { findNearestArticles } = await import('@/lib/article-finder')
          const nearestArticles = findNearestArticles(query.jo, articles)

          if (nearestArticles.length > 0) {
            selectedJo = nearestArticles[0].jo
            debugLogger.warning(`조문 없음: ${query.jo} → 유사 조문 표시: ${nearestArticles[0].joNum}`)
          } else {
            debugLogger.warning(`조문 없음: ${query.jo}`)
          }

          actions.setArticleNotFound({
            requestedJo: query.jo,
            lawTitle: meta.lawTitle,
            nearestArticles,
            crossLawSuggestions: [],
          })
        }
      }

      const finalLawData: LawDataState = {
        meta,
        articles,
        selectedJo,
        viewMode,
      }

      actions.setLawData(finalLawData)

      const contentSource = lawContentCache ? "IndexedDB 캐시" : "eflaw API"
      debugLogger.success(`✅ 법령 본문 로드 완료 (${contentSource})`, {
        lawTitle: meta.lawTitle,
        articleCount: articles.length,
      })

      // lawData를 IndexedDB에 즉시 저장
      try {
        const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
        const currentState = window.history.state
        const currentSearchId = currentState?.searchId

        if (currentSearchId) {
          const existingCache = await getSearchResult(currentSearchId)

          if (existingCache) {
            // 법령 선택 시 query 정보도 함께 업데이트 (새로고침 시 올바른 쿼리 복원)
            const updatedQuery: SearchQuery = {
              lawName: meta.lawTitle,
              article: query.article,
              jo: query.jo,
            }

            await saveSearchResult({
              ...existingCache,
              query: updatedQuery,
              lawData: {
                meta: {
                  lawId: selectedLaw.lawId || meta.lawId,
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
            debugLogger.success('💾 lawData + query를 IndexedDB에 저장 완료', {
              searchId: currentSearchId,
              lawTitle: meta.lawTitle,
              query: updatedQuery,
            })
          }
        }
      } catch (cacheError) {
        debugLogger.error('⚠️ lawData 저장 실패', cacheError)
      }

      actions.updateProgress('complete', 100)

    } catch (error) {
      reportError(
        "법령 조회",
        error instanceof Error ? error : new Error(String(error)),
        { selectedLaw, query },
        apiLogs,
      )
      throw error
    }
  }, [actions, reportError])

  return { fetchLawContent }
}
