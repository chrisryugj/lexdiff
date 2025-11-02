"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  BookOpen,
  GitCompare,
  Star,
  Sparkles,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import type { LawArticle, LawMeta } from "@/lib/law-types"
import { extractArticleText } from "@/lib/law-xml-parser"
import { buildJO, formatJO } from "@/lib/law-parser"
import { ReferenceModal } from "@/components/reference-modal"
import { RevisionHistory } from "@/components/revision-history"

interface LawViewerProps {
  meta: LawMeta
  articles: LawArticle[]
  selectedJo?: string
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void
  onToggleFavorite?: (jo: string) => void
  favorites?: Set<string>
  isOrdinance?: boolean
  viewMode?: "single" | "full"
}

export function LawViewer({
  meta,
  articles,
  selectedJo,
  onCompare,
  onSummarize,
  onToggleFavorite,
  favorites = new Set(),
  isOrdinance = false,
  viewMode = "single",
}: LawViewerProps) {
  const isFullView = isOrdinance || viewMode === "full"

  console.log("[v0] LawViewer 렌더링:", {
    lawTitle: meta.lawTitle,
    articleCount: articles.length,
    selectedJo,
    isOrdinance,
    viewMode,
    isFullView,
    firstArticle: articles[0] ? { jo: articles[0].jo, title: articles[0].title } : null,
  })

  const [activeJo, setActiveJo] = useState<string>(selectedJo || articles[0]?.jo || "")
  const [fontSize, setFontSize] = useState<number>(14)
  const [isArticleListExpanded, setIsArticleListExpanded] = useState(false)
  const articleRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const [refModal, setRefModal] = useState<{ open: boolean; title?: string; html?: string }>({ open: false })
  const [lastExternalRef, setLastExternalRef] = useState<{ lawName: string; joLabel?: string } | null>(null)

  const activeArticle = articles.find((a) => a.jo === activeJo)

  useEffect(() => {
    if (activeArticle) {
      console.log(`[v0] [개정이력] Active article revision history:`, {
        jo: activeArticle.jo,
        title: activeArticle.title,
        hasRevisionHistory: !!activeArticle.revisionHistory,
        revisionCount: activeArticle.revisionHistory?.length || 0,
        revisions: activeArticle.revisionHistory,
      })
    }
  }, [activeArticle])

  useEffect(() => {
    console.log("[v0] LawViewer useEffect 실행:", { selectedJo, activeJo, isOrdinance, viewMode, isFullView })

    if (selectedJo) {
      console.log("[v0] selectedJo 변경 감지 - activeJo 업데이트:", selectedJo)
      setActiveJo(selectedJo)

      if (!isFullView && contentRef.current) {
        console.log("[v0] 단일 조문 모드 - 스크롤 최상단 이동")
        setTimeout(() => {
          contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }, 100)
      }
    } else if (articles.length === 1 && articles[0]) {
      console.log("[v0] 조문 1개 - 자동 선택:", articles[0].jo)
      setActiveJo(articles[0].jo)
    } else if (articles.length > 0 && !activeJo) {
      console.log("[v0] activeJo 없음 - 첫 번째 조문 선택:", articles[0].jo)
      setActiveJo(articles[0].jo)
    }
  }, [selectedJo, articles, isOrdinance, viewMode, isFullView, activeJo])

  useEffect(() => {
    articleRefs.current = {}
  }, [articles])

  const handleArticleClick = (jo: string) => {
    console.log("[v0] 조문 클릭:", { jo, isOrdinance, viewMode, isFullView })

    setActiveJo(jo)

    if (isFullView) {
      console.log("[v0] 전체 조문 뷰 - 스크롤 이동")
      const element = articleRefs.current[jo]
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    } else {
      console.log("[v0] 단일 조문 뷰 - activeJo 설정 완료")
    }
  }

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 24))
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 2, 10))
  const resetFontSize = () => setFontSize(14)

  const openLawCenter = () => {
    if (!activeArticle) return
    const lawTitle = meta.lawTitle
    const articleNum = formatJO(activeArticle.jo)
    const url = `https://www.law.go.kr/법령/${lawTitle}/${articleNum}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const formatSimpleJo = (jo: string): string => {
    console.log("[v0] formatSimpleJo 호출:", jo)

    if (jo.length === 6) {
      const articleNum = Number.parseInt(jo.substring(0, 4), 10)
      const branchNum = Number.parseInt(jo.substring(4, 6), 10)

      const result = branchNum === 0 ? `${articleNum}조` : `${articleNum}조의${branchNum}`
      console.log("[v0] formatSimpleJo 결과 (6자리):", result)
      return result
    }

    if (jo.length === 8) {
      const articleNum = Number.parseInt(jo.substring(0, 4), 10)
      const result = `${articleNum}조`
      console.log("[v0] formatSimpleJo 결과 (8자리):", result)
      return result
    }

    if (jo.startsWith("제") && jo.includes("조")) {
      const result = jo.replace(/^제(\d+)조/, "$1조")
      console.log("[v0] formatSimpleJo 결과 (제N조):", result)
      return result
    }

    console.log("[v0] formatSimpleJo 결과 (변환 없음):", jo)
    return jo
  }

  // Handle clicks on linkified references inside article content
  const handleContentClick: React.MouseEventHandler<HTMLDivElement> = async (e) => {
    const target = e.target as HTMLElement
    if (target && target.tagName === "A") {
      e.preventDefault()
      const refType = target.getAttribute("data-ref")
      if (refType === "article") {
        const articleLabel = target.getAttribute("data-article") || ""
        // If immediately preceded by external law anchor, treat as external
        const prev = target.previousElementSibling as HTMLElement | null
        if (prev && prev.tagName === "A" && prev.classList.contains("law-ref") && prev.getAttribute("data-ref") === "law") {
          const lawName = prev.getAttribute("data-law") || ""
          await openExternalLawArticleModal(lawName, articleLabel)
          setLastExternalRef({ lawName, joLabel: articleLabel })
          return
        }
        try {
          const joCode = buildJO(articleLabel)
          const found = articles.find((a) => a.jo === joCode || formatJO(a.jo) === formatJO(joCode))
          if (found) {
            setRefModal({
              open: true,
              title: `${meta.lawTitle} ${formatJO(found.jo)}${found.title ? ` (${found.title})` : ""}`,
              html: extractArticleText(found),
            })
            return
          }
        } catch {}
      } else if (refType === "law") {
        const lawName = target.getAttribute("data-law") || ""
        // Try to pair with next article anchor on the same line
        let articleLabel = ""
        const next = target.nextElementSibling as HTMLElement | null
        if (next && next.tagName === "A" && next.classList.contains("law-ref") && next.getAttribute("data-ref") === "article") {
          articleLabel = next.getAttribute("data-article") || ""
        }
        if (articleLabel) {
          await openExternalLawArticleModal(lawName, articleLabel)
          setLastExternalRef({ lawName, joLabel: articleLabel })
        } else {
          // Fallback: show minimal modal with a link
          setRefModal({ open: true, title: lawName, html: `<a href=\"https://www.law.go.kr/법령/${encodeURIComponent(lawName)}\" target=\"_blank\" rel=\"noopener\">법령 페이지 열기</a>` })
          setLastExternalRef({ lawName })
        }
      } else if (refType === "law-article") {
        const lawName = target.getAttribute("data-law") || ""
        const articleLabel = target.getAttribute("data-article") || ""
        await openExternalLawArticleModal(lawName, articleLabel)
        setLastExternalRef({ lawName, joLabel: articleLabel })
      } else if (refType === "same") {
        // Use last external reference law + current article, change to requested part
        if (lastExternalRef && lastExternalRef.joLabel) {
          const part = target.getAttribute("data-part") || ""
          const base = lastExternalRef.joLabel.replace(/제\d+항(제\d+호)?/, "").trim()
          const articleLabel = `${base}${part}`
          await openExternalLawArticleModal(lastExternalRef.lawName, articleLabel)
          setLastExternalRef({ lawName: lastExternalRef.lawName, joLabel: articleLabel })
        }
      } else if (refType === "related") {
        if (!activeArticle) return
        const kind = target.getAttribute("data-kind") || "decree"
        const joLabel = formatJO(activeArticle.jo)
        try {
          const qs = new URLSearchParams({ baseLaw: meta.lawTitle, joLabel, kind })
          const res = await fetch(`/api/related?${qs.toString()}`)
          const data = await res.json()
          if (data?.candidates?.length > 0) {
            const best = data.candidates[0]
            setRefModal({
              open: true,
              title: `${data.lawName} ${best.joNum}${best.title ? ` (${best.title})` : ""}`,
              html: best.html,
            })
          } else {
            // fallback: 안내 모달
            const suffix = kind === "rule" ? "시행규칙" : "시행령"
            setRefModal({ open: true, title: `${meta.lawTitle} ${suffix}`, html: "관련 조문을 찾지 못했습니다." })
          }
        } catch (err) {
          console.error("related lookup failed", err)
        }
      }
    }
  }

  // Helper: fetch external law article and show in modal
  async function openExternalLawArticleModal(lawName: string, articleLabel: string) {
    try {
      const qs = new URLSearchParams({ query: lawName })
      const searchRes = await fetch(`/api/law-search?${qs.toString()}`)
      const searchXml = await searchRes.text()
      const lawIdMatch = searchXml.match(/<법령ID>([^<]+)<\/법령ID>/)
      const mstMatch = searchXml.match(/<법령일련번호>([^<]+)<\/법령일련번호>/)
      const lawId = lawIdMatch?.[1]
      const mst = mstMatch?.[1]
      if (!lawId && !mst) {
        setRefModal({ open: true, title: lawName, html: "법령을 찾지 못했습니다." })
        return
      }
      const identifierParams = new URLSearchParams()
      if (lawId) {
        identifierParams.append("lawId", lawId)
      } else if (mst) {
        identifierParams.append("mst", mst)
      }
      const eflawRes = await fetch(`/api/eflaw?${identifierParams.toString()}`)
      const eflawXml = await eflawRes.text()
      // Parse to find the target article
      const { parseLawXML } = await import("@/lib/law-xml-parser")
      const parsed = parseLawXML(eflawXml)
      let joCode = ""
      try { joCode = buildJO(articleLabel) } catch {}
      const found = parsed.articles.find((a) => a.jo === joCode || formatJO(a.jo) === formatJO(joCode))
      if (found) {
        setRefModal({
          open: true,
          title: `${lawName} ${formatJO(found.jo)}${found.title ? ` (${found.title})` : ""}`,
          html: extractArticleText(found),
        })
      } else {
        setRefModal({ open: true, title: lawName, html: "해당 조문을 찾지 못했습니다." })
      }
    } catch (err) {
      console.error("openExternalLawArticleModal error", err)
      setRefModal({ open: true, title: lawName, html: "로딩 중 오류가 발생했습니다." })
    }
  }

  console.log("[v0] LawViewer 렌더링 완료:", {
    activeJo,
    activeArticle: activeArticle ? { jo: activeArticle.jo, title: activeArticle.title } : null,
    viewMode,
    displayMode: isOrdinance
      ? "조례 (전체 조문)"
      : viewMode === "full"
        ? "법령 (전체 조문)"
        : "법령 (선택 조문)",
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)]">
      {/* Left sidebar - Article navigation */}
      <Card className="p-4 flex flex-col">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">조문 목록</h3>
              <Badge variant="secondary" className="text-xs">
                {articles.length}개 조문
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsArticleListExpanded(!isArticleListExpanded)}
              className="md:hidden"
            >
              {isArticleListExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  접기
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  펼치기
                </>
              )}
            </Button>
          </div>
        </div>
        <Separator className="mb-4" />
        <ScrollArea className={`flex-1 ${isArticleListExpanded ? "" : "max-h-[100px] md:max-h-none"}`}>
          <div className="space-y-1 pr-4">
            {articles.map((article) => (
              <button
                key={article.jo}
                onClick={() => handleArticleClick(article.jo)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  activeJo === article.jo
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-secondary text-foreground"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {formatSimpleJo(article.jo)}
                    {article.title && <span className="text-xs ml-1">({article.title})</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    {article.hasChanges && (
                      <AlertCircle className="h-3 w-3 text-[var(--color-warning)]" title="변경된 조문" />
                    )}
                    {favorites.has(article.jo) && <Star className="h-3 w-3 fill-[var(--color-warning)]" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Right panel - Article content */}
      <Card className="flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <BookOpen className="h-5 w-5 text-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">
                    {isOrdinance || viewMode === "full" ? (
                      meta.lawTitle
                    ) : activeArticle ? (
                      <>
                        {meta.lawTitle} {formatJO(activeArticle.jo)}
                        {activeArticle.title && (
                          <span className="text-muted-foreground"> ({activeArticle.title})</span>
                        )}
                      </>
                    ) : (
                      meta.lawTitle
                    )}
                  </h2>
                  {!isOrdinance && viewMode === "full" && (
                    <Badge variant="outline" className="text-xs">
                      전체 조문
                    </Badge>
                  )}
                </div>
              </div>

              {!isOrdinance && viewMode === "full" && activeArticle && (
                <p className="text-sm text-muted-foreground">
                  현재 선택된 조문: {formatJO(activeArticle.jo)}
                  {activeArticle.title && <span className="text-muted-foreground"> ({activeArticle.title})</span>}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {meta.latestEffectiveDate && (
                <Badge variant="outline" className="text-xs">
                  시행: {meta.latestEffectiveDate}
                </Badge>
              )}
              {meta.revisionType && (
                <Badge variant="secondary" className="text-xs">
                  {meta.revisionType}
                </Badge>
              )}
            </div>
          </div>

          {!isOrdinance && activeArticle && (
            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="sm" onClick={() => onCompare?.(activeArticle.jo)}>
                <GitCompare className="h-4 w-4 mr-2" />
                신·구법 비교
              </Button>
              <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle.jo)}>
                <Sparkles className="h-4 w-4 mr-2" />
                AI 요약
              </Button>
              <Button
                variant={favorites.has(activeArticle.jo) ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleFavorite?.(activeArticle.jo)}
              >
                <Star className={`h-4 w-4 mr-2 ${favorites.has(activeArticle.jo) ? "fill-current" : ""}`} />
                즐겨찾기
              </Button>
              <Button variant="outline" size="sm" onClick={openLawCenter}>
                <ExternalLink className="h-4 w-4 mr-2" />
                원문 보기
              </Button>

              <div className="flex items-center gap-1 ml-auto border-l border-border pl-2">
                <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기">
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
              </div>
            </div>
          )}

          {isOrdinance && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기">
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" ref={contentRef}>
            <div className="p-6">
              {isOrdinance ? (
                <div className="space-y-8">
                  {articles.map((article) => (
                    <div
                      key={article.jo}
                      id={`article-${article.jo}`}
                      ref={(el) => {
                        articleRefs.current[article.jo] = el
                      }}
                      className="prose prose-sm max-w-none dark:prose-invert scroll-mt-4"
                    >
                      <div
                        className="whitespace-pre-wrap text-foreground leading-relaxed break-words"
                        style={{
                          fontSize: `${fontSize}px`,
                          lineHeight: "1.8",
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: extractArticleText(article) }}
                      />
                      <Separator className="my-6" />
                    </div>
                  ))}

                  {articles.some((a) => a.revisionHistory && a.revisionHistory.length > 0) && (
                    <div className="mt-8 pt-8 border-t border-border">
                      <h3 className="text-lg font-semibold mb-4">개정 이력</h3>
                      {articles
                        .filter((a) => a.revisionHistory && a.revisionHistory.length > 0)
                        .map((article) => (
                          <div key={article.jo} className="mb-6">
                            <RevisionHistory
                              history={article.revisionHistory!}
                              articleTitle={
                                article.title
                                  ? `${formatSimpleJo(article.jo)} (${article.title})`
                                  : formatSimpleJo(article.jo)
                              }
                            />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ) : viewMode === "full" ? (
                <div className="space-y-10">
                  {articles.map((article, index) => (
                    <div
                      key={article.jo}
                      id={`article-${article.jo}`}
                      ref={(el) => {
                        articleRefs.current[article.jo] = el
                      }}
                      className="prose prose-sm max-w-none dark:prose-invert scroll-mt-24"
                    >
                      <div className="mb-6 pb-4 border-b border-border">
                        <h3 className="text-2xl font-bold text-foreground mb-2">
                          {formatJO(article.jo)}
                          {article.title && <span className="text-muted-foreground"> ({article.title})</span>}
                        </h3>
                      </div>

                      <div
                        className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
                        style={{
                          fontSize: `${fontSize}px`,
                          lineHeight: "1.8",
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: extractArticleText(article) }}
                      />

                      {article.revisionHistory && article.revisionHistory.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-border">
                          <RevisionHistory
                            history={article.revisionHistory}
                            articleTitle={
                              article.title
                                ? `${formatJO(article.jo)} (${article.title})`
                                : formatJO(article.jo)
                            }
                          />
                        </div>
                      )}

                      {article.hasChanges && (
                        <div className="mt-6 p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-[var(--color-warning)] shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-foreground">변경된 조문</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                이 조문은 최근 개정되었습니다. 신·구법 비교를 통해 변경 내용을 확인하세요.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {index < articles.length - 1 && <Separator className="my-8" />}
                    </div>
                  ))}
                </div>
              ) : activeArticle ? (
                /* 법령: 조문 번호와 제목을 명확히 표시하고 본문 표시 */
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="mb-6 pb-4 border-b border-border">
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      {formatJO(activeArticle.jo)}
                      {activeArticle.title && <span className="text-muted-foreground"> ({activeArticle.title})</span>}
                    </h3>
                  </div>

                  <div
                    className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: "1.8",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                    onClick={handleContentClick}
                    dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
                  />

                  {activeArticle.revisionHistory && activeArticle.revisionHistory.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-border">
                      <RevisionHistory
                        history={activeArticle.revisionHistory}
                        articleTitle={
                          activeArticle.title ? `${formatJO(activeArticle.jo)} (${activeArticle.title})` : undefined
                        }
                      />
                    </div>
                  )}

                  {activeArticle.hasChanges && (
                    <div className="mt-6 p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-[var(--color-warning)] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">변경된 조문</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            이 조문은 최근 개정되었습니다. 신·구법 비교를 통해 변경 내용을 확인하세요.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>조문을 선택하세요</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </Card>
      <ReferenceModal
        isOpen={refModal.open}
        onClose={() => setRefModal({ open: false })}
        title={refModal.title || "연결된 본문"}
        html={refModal.html}
      />
    </div>
  )
}
