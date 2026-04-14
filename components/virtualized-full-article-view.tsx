"use client"

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { LawArticle } from "@/lib/law-types"
import { extractArticleText } from "@/lib/law-xml-parser"
import { formatJO } from "@/lib/law-parser"
import { favoritesStore } from "@/lib/favorites-store"
import { cn } from "@/lib/utils"
import { sanitizeForRender } from "@/lib/sanitize-html-render"

// ✅ 모듈 레벨 영구 캐시 — 가상화 리스트에서 virtual item이 언마운트/리마운트될 때
// useMemo는 재실행되지만 이 Map은 살아있음. 두 번째 방문부터 즉각 렌더.
// 키: `${lawTitle}|${jo}|${content.length}` (content 변경 감지용)
const articleHtmlCache = new Map<string, string>()
const ARTICLE_HTML_CACHE_MAX = 2048

function getCachedArticleHtml(article: LawArticle, lawTitle: string): string {
  const key = `${lawTitle}|${article.jo}|${article.content?.length ?? 0}`
  const cached = articleHtmlCache.get(key)
  if (cached !== undefined) return cached
  // 법제처 API 법령 본문 = 신뢰 소스. sanitize 생략으로 조당 ~30ms 절감.
  const html = extractArticleText(article, false, lawTitle)
  articleHtmlCache.set(key, html)
  if (articleHtmlCache.size > ARTICLE_HTML_CACHE_MAX) {
    const oldest = articleHtmlCache.keys().next().value
    if (oldest !== undefined) articleHtmlCache.delete(oldest)
  }
  return html
}

// ✅ 성능 최적화: 컴포넌트를 외부로 이동 (매번 재생성 방지)
const ArticleContent = React.memo(function ArticleContent({
  article,
  lawTitle,
  onContentClick
}: {
  article: LawArticle
  lawTitle: string
  onContentClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}) {
  const html = useMemo(
    () => getCachedArticleHtml(article, lawTitle),
    [article.jo, article.content, lawTitle]
  )
  return <div onClick={onContentClick} dangerouslySetInnerHTML={{ __html: html }} />
})

interface VirtualizedFullArticleViewProps {
  articles: LawArticle[]
  preambles: Array<{ content: string }>
  activeJo: string
  fontSize: number
  lawTitle: string
  lawId?: string
  mst?: string
  effectiveDate?: string
  onContentClick: (e: React.MouseEvent<HTMLDivElement>) => void
  articleRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  scrollParentRef?: React.RefObject<HTMLDivElement | null>
  isOrdinance?: boolean
  isPrecedent?: boolean  // 판례 모드
}

/**
 * 전문조회 모드용 가상화된 조문 리스트
 * - 모든 조문을 한 번에 렌더링하지 않고 보이는 부분만 렌더링
 * - 성능 최적화: DOM 노드 93% 감소
 * - 대용량 법령(400+ 조문)도 부드러운 스크롤
 */
export const VirtualizedFullArticleView = React.memo(function VirtualizedFullArticleView({
  articles,
  preambles,
  activeJo,
  fontSize,
  lawTitle,
  lawId,
  mst,
  effectiveDate,
  onContentClick,
  articleRefs,
  scrollParentRef,
  isOrdinance = false,
  isPrecedent = false,
}: VirtualizedFullArticleViewProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  // 측정된 높이 캐시 — estimate(200)와 실제 높이(400~800)의 괴리로 인한
  // scrollToIndex 점프 후 연쇄 재측정/스크롤 보정 루프를 끊기 위함.
  const heightCacheRef = useRef<Map<string, number>>(new Map())

  // ✅ onContentClick 참조 고정 — law-viewer의 handleContentClick이 activeJo 바뀔 때마다
  // 새 참조로 재생성되어 ArticleContent memo가 매번 깨지던 문제 해결.
  // 래퍼는 마운트 1회만 만들고, 내부에서 최신 콜백을 ref로 조회.
  const onContentClickRef = useRef(onContentClick)
  onContentClickRef.current = onContentClick
  const stableContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    onContentClickRef.current?.(e)
  }, [])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [copiedJo, setCopiedJo] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false })

  // ✅ 우선순위 프리워밍: activeJo 주변부터 바깥으로 퍼지면서
  // extractArticleText + sanitizeForRender 호출 → LRU 캐시 데움.
  // setTimeout(0) + 5개 배치로 빠르게 처리 (rIC는 idle 기다리느라 늦음).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!articles || articles.length === 0) return

    // 방문 순서: activeJo 인덱스 → 앞뒤 교차 확장
    const centerIdx = Math.max(0, articles.findIndex(a => a.jo === activeJo))
    const order: number[] = [centerIdx]
    for (let d = 1; d < articles.length; d++) {
      const r = centerIdx + d
      const l = centerIdx - d
      if (r < articles.length) order.push(r)
      if (l >= 0) order.push(l)
      if (order.length >= articles.length) break
    }

    let cancelled = false
    let cursor = 0
    const BATCH = 5
    let handle: ReturnType<typeof setTimeout> | null = null

    const tick = () => {
      if (cancelled) return
      const end = Math.min(cursor + BATCH, order.length)
      for (; cursor < end; cursor++) {
        const idx = order[cursor]
        try {
          // 모듈 레벨 캐시에 미리 저장 → 첫 클릭 시 캐시 히트
          getCachedArticleHtml(articles[idx], lawTitle)
        } catch {
          // 개별 조문 파싱 에러는 무시 — 실제 렌더 경로에서 처리됨
        }
      }
      if (cursor < order.length) {
        handle = setTimeout(tick, 0)
      }
    }
    handle = setTimeout(tick, 0)

    return () => {
      cancelled = true
      if (handle) clearTimeout(handle)
    }
    // activeJo 의도적 제외 — 변경 시마다 재스케줄하면 캐시 이미 데운 것도 재실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, lawTitle])

  // 즐겨찾기 상태 동기화
  useEffect(() => {
    const updateFavorites = () => {
      const favs = favoritesStore.getFavorites()
      const favSet = new Set(
        favs
          .filter(f => f.lawTitle === lawTitle)
          .map(f => f.jo)
      )
      setFavorites(favSet)
    }

    updateFavorites()
    const unsubscribe = favoritesStore.subscribe(updateFavorites)
    return () => { unsubscribe() }
  }, [lawTitle])

  // 즐겨찾기 토글
  const toggleFavorite = useCallback((article: LawArticle) => {
    const jo = article.jo
    const isFav = favoritesStore.isFavorite(lawTitle, jo)

    if (isFav) {
      const favs = favoritesStore.getFavorites()
      const fav = favs.find(f => f.lawTitle === lawTitle && f.jo === jo)
      if (fav) {
        favoritesStore.removeFavorite(fav.id)
      }
    } else {
      // 조문 내용에서 서명 생성
      const content = article.content || ''
      const signature = content.substring(0, 100)

      favoritesStore.addFavorite({
        lawId,
        mst,
        lawTitle,
        jo,
        lastSeenSignature: signature,
        effectiveDate,
      })
    }
  }, [lawTitle, lawId, mst, effectiveDate])

  // 조문 복사
  const copyArticle = useCallback(async (article: LawArticle, e: React.MouseEvent) => {
    // ⚠️ CRITICAL: await 전에 좌표를 먼저 저장해야 함
    // React 이벤트 객체는 풀링되어 await 후에는 currentTarget이 null이 됨
    const button = e.currentTarget as HTMLElement
    const rect = button.getBoundingClientRect()
    const feedbackX = rect.left + rect.width / 2
    const feedbackY = rect.top

    const joLabel = formatJO(article.jo)
    const title = article.title ? ` (${article.title})` : ''
    const content = extractArticleText(article, false, lawTitle)
    // HTML 태그 제거
    const plainText = content.replace(/<[^>]+>/g, '').trim()
    const fullText = `${lawTitle} ${joLabel}${title}\n\n${plainText}`

    try {
      await navigator.clipboard.writeText(fullText)
      setCopiedJo(article.jo)

      // 복사 피드백 위치 설정 - 미리 저장한 좌표 사용
      setCopyFeedback({
        x: feedbackX,
        y: feedbackY,
        show: true
      })

      setTimeout(() => {
        setCopiedJo(null)
        setCopyFeedback(prev => ({ ...prev, show: false }))
      }, 1500)
    } catch (err) {
      console.error('복사 실패:', err)
    }
  }, [lawTitle])

  // ✅ 실제 스크롤 컨테이너 찾기
  const getScrollElement = () => {
    if (scrollParentRef?.current) {
      // ScrollArea 내부의 실제 스크롤 엘리먼트 찾기
      const viewport = scrollParentRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement
      return viewport || parentRef.current
    }
    return parentRef.current
  }

  // ✅ 성능 최적화: allItems를 useMemo로 캐싱 (배열 재생성 방지)
  const allItems = useMemo(() => [
    ...preambles.map((p, idx) => ({ type: 'preamble' as const, index: idx, content: p })),
    ...articles.map((a, idx) => ({ type: 'article' as const, index: idx, article: a })),
  ], [preambles, articles])

  // virtualItem key — 캐시 조회/저장에 사용
  const getItemKey = useCallback((index: number): string => {
    const item = allItems[index]
    if (!item) return `i-${index}`
    return item.type === 'preamble' ? `p-${item.index}` : `a-${item.article.jo}`
  }, [allItems])

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: getScrollElement,
    // 캐시된 측정값 우선, 없으면 현실적 기본값(조문 평균 ~480px).
    // 200px 같은 과소추정은 멀리 점프 시 totalSize/offset 어긋남 → 스크롤 보정 루프 유발.
    estimateSize: (index) => {
      const key = getItemKey(index)
      const cached = heightCacheRef.current.get(key)
      if (cached && cached > 0) return cached
      const item = allItems[index]
      if (item?.type === 'preamble') return 80
      return 480
    },
    overscan: 5, // 점프 후 주변 재측정 빈도 감소
    measureElement: typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
      ? (element) => {
          const height = element?.getBoundingClientRect().height ?? 0
          const idxAttr = element?.getAttribute('data-index')
          if (idxAttr && height > 0) {
            heightCacheRef.current.set(getItemKey(Number(idxAttr)), height)
          }
          return height
        }
      : undefined,
  })

  const formatSimpleJo = (article: LawArticle): string => {
    // ✅ 판례는 joNum을 직접 사용
    if (isPrecedent && article.joNum) {
      return article.joNum
    }

    const jo = article.jo
    try {
      // Already formatted (e.g., "제1조", "제10조의2")
      if (jo.startsWith("제") && jo.includes("조")) {
        return jo
      }

      // 6자리 숫자 코드 처리
      if (jo.length === 6 && /^\d{6}$/.test(jo)) {
        if (isOrdinance) {
          // Ordinance format: AABBCC (AA = article, BB = branch, CC = sub)
          // Example: "010000" = 제1조, "010100" = 제1조의1
          const articleNum = Number.parseInt(jo.substring(0, 2), 10)
          const branchNum = Number.parseInt(jo.substring(2, 4), 10)
          const subNum = Number.parseInt(jo.substring(4, 6), 10)

          let result = `제${articleNum}조`
          if (branchNum > 0) result += `의${branchNum}`
          if (subNum > 0) result += `-${subNum}`

          return result
        } else {
          // Law format: AAAABB (AAAA = article, BB = branch)
          const articleNum = Number.parseInt(jo.substring(0, 4), 10)
          const branchNum = Number.parseInt(jo.substring(4, 6), 10)
          return branchNum === 0 ? `제${articleNum}조` : `제${articleNum}조의${branchNum}`
        }
      }

      // Fallback to formatJO for other formats
      return formatJO(jo)
    } catch (e) {
      return jo
    }
  }

  // activeJo 변경 시 해당 조문으로 스크롤
  useEffect(() => {
    if (!activeJo) return

    const articleIndex = articles.findIndex(a => a.jo === activeJo)
    if (articleIndex === -1) return
    const itemIndex = preambles.length + articleIndex

    const performScroll = () => {
      const scrollElement = getScrollElement()
      if (!scrollElement) return

      const allVirtualItems = virtualizer.getVirtualItems()
      const targetVirtualItem = allVirtualItems.find(item => item.index === itemIndex)

      if (targetVirtualItem) {
        // 이미 렌더링되어 있으면 정확한 위치로 즉시 이동
        scrollElement.scrollTop = targetVirtualItem.start
      } else {
        // 아직 렌더링 안 된 경우 virtualizer에게 요청
        setTimeout(() => {
          virtualizer.scrollToIndex(itemIndex, { align: 'start' })
        }, 0)
      }
    }

    setTimeout(performScroll, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJo])

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto h-full w-full px-5 pt-3 slim-scrollbar"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = allItems[virtualItem.index]

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {item.type === 'preamble' ? (
                // Preamble rendering
                <div
                  className="mb-8 text-xl font-bold text-center"
                  dangerouslySetInnerHTML={{ __html: sanitizeForRender(item.content.content) }}
                />
              ) : isPrecedent ? (
                // ✅ 판례 전용 렌더링 - 컴팩트 스타일
                <div
                  id={`article-${item.article.jo}`}
                  ref={(el) => {
                    articleRefs.current[item.article.jo] = el
                  }}
                  className="prose prose-sm max-w-none dark:prose-invert scroll-mt-24"
                >
                  {/* 섹션 헤더 */}
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground m-0 flex items-center gap-1.5 font-maruburi">
                      <span className="text-brand-gold">•</span>
                      {item.article.joNum || item.article.title}
                    </h3>
                    {/* 복사 버튼만 표시 (즐겨찾기 없음) */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyArticle(item.article, e)
                      }}
                      title="복사"
                    >
                      {copiedJo === item.article.jo ? (
                        <Icon name="check" className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Icon name="copy" className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      )}
                    </Button>
                  </div>

                  {/* 내용 - br 태그 처리 + 빈줄 정리 */}
                  <div
                    className="text-foreground leading-relaxed font-maruburi"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: "1.7",
                    }}
                    onClick={stableContentClick}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeForRender(
                        (item.article.content || '')
                          .replace(/<br\\>/g, '<br />')  // <br\> → <br />
                          .replace(/<br>/g, '<br />')    // <br> → <br />
                          .replace(/\n/g, '<br />')      // 줄바꿈 → <br />
                          .replace(/&nbsp;/g, ' ')       // &nbsp; → 공백
                          // 【】 뒤의 연속 공백을 탭 하나로 정리
                          .replace(/【([^】]*)】\s{2,}/g, '【$1】\t')
                          // 연속된 빈줄 제거 (br 사이 공백 포함)
                          .replace(/(<br\s*\/?>\s*){2,}/gi, '<br />')
                          // 시작/끝 빈줄 제거
                          .replace(/^(\s*<br\s*\/?>\s*)+/gi, '')
                          .replace(/(\s*<br\s*\/?>\s*)+$/gi, '')
                          .trim()
                      )
                    }}
                  />

                  {item.index < articles.length - 1 && (
                    <Separator className="my-3" />
                  )}
                </div>
              ) : (
                // 일반 법령 Article rendering
                <div
                  id={`article-${item.article.jo}`}
                  ref={(el) => {
                    articleRefs.current[item.article.jo] = el
                  }}
                  className="prose prose-sm max-w-none dark:prose-invert scroll-mt-24"
                >
                  <div className="mb-2 pb-1 border-b border-border">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-lg font-bold text-foreground flex items-center gap-1 lg:gap-2 flex-1 min-w-0 font-maruburi">
                        <span className="whitespace-nowrap flex-shrink-0">{formatSimpleJo(item.article)}</span>
                        {item.article.title && (
                          <span className="text-muted-foreground truncate">({item.article.title})</span>
                        )}
                        {activeJo === item.article.jo && (
                          <Icon
                            name="bookmark-check"
                            className="h-4 w-4 lg:h-5 lg:w-5 text-primary flex-shrink-0"
                            title="현재 선택된 조문"
                          />
                        )}
                      </h3>
                      <div className="flex items-center gap-0 flex-shrink-0">
                        {/* 즐겨찾기 버튼 */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(item.article)
                          }}
                          title={favorites.has(item.article.jo) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        >
                          <Icon
                            name="star"
                            className={`h-4 w-4 ${
                              favorites.has(item.article.jo)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground hover:text-yellow-400"
                            }`}
                          />
                        </Button>
                        {/* 복사 버튼 */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            copyArticle(item.article, e)
                          }}
                          title="조문 복사"
                        >
                          {copiedJo === item.article.jo ? (
                            <Icon name="check" className="h-4 w-4 text-green-500" />
                          ) : (
                            <Icon name="copy" className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div
                    className="text-foreground leading-relaxed break-words whitespace-pre-wrap font-maruburi"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: "1.8",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                    onClick={stableContentClick}
                  >
                    <ArticleContent article={item.article} lawTitle={lawTitle} onContentClick={stableContentClick} />
                  </div>

                  {item.article.hasChanges && (
                    <div className="mt-6 p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
                      <div className="flex items-start gap-2">
                        <Icon name="alert-circle" className="h-5 w-5 text-[var(--color-warning)] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">변경된 조문</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            이 조문은 최근 개정되었습니다. 신·구법 비교를 통해 변경 내용을 확인하세요.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {item.index < articles.length - 1 && (
                    <Separator className="my-3" />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 복사 피드백 포탈 */}
      {copyFeedback.show && typeof document !== "undefined" && createPortal(
        <div
          className={cn(
            "fixed z-[9999] pointer-events-none",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
          )}
          style={{
            left: copyFeedback.x,
            top: copyFeedback.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-emerald-500 text-white p-1.5 rounded-full shadow-lg">
            <Icon name="check" className="w-4 h-4" />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
})
