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
}

const getArticleJo = (article: LawArticle, fallbackIndex?: number): string => {
  if (article.jo && article.jo.trim()) {
    return article.jo
  }

  if (article.joNum && article.joNum.trim()) {
    try {
      return buildJO(article.joNum)
    } catch (error) {
      console.warn("[v0] 조문 번호 정규화 실패, fallback 사용", {
        joNum: article.joNum,
        error,
      })
    }
  }

  if (typeof fallbackIndex === "number") {
    return `${(fallbackIndex + 1).toString().padStart(4, "0")}00`
  }

  return ""
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
}: LawViewerProps) {
  console.log("[v0] LawViewer 렌더링:", {
    lawTitle: meta.lawTitle,
    articleCount: articles.length,
    selectedJo,
    isOrdinance,
    firstArticle: articles[0] ? { jo: articles[0].jo, title: articles[0].title } : null,
  })

  const [activeJo, setActiveJo] = useState<string>(
    selectedJo || (articles[0] ? getArticleJo(articles[0], 0) : ""),
  )
  const [fontSize, setFontSize] = useState<number>(14)
  const [isArticleListExpanded, setIsArticleListExpanded] = useState(false)
  const articleRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const [refModal, setRefModal] = useState<{ open: boolean; title?: string; html?: string }>({ open: false })
  const [lastExternalRef, setLastExternalRef] = useState<{ lawName: string; joLabel?: string } | null>(null)

  const activeArticle = articles.find((a) => a.jo === activeJo)
  const activeArticleIndex = activeArticle ? articles.findIndex((a) => a.jo === activeArticle.jo) : -1

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
    console.log("[v0] LawViewer useEffect 실행:", { selectedJo, activeJo, isOrdinance })

    const firstArticle = articles[0]
    const firstArticleJo = firstArticle ? getArticleJo(firstArticle, 0) : ""

    if (selectedJo) {
      console.log("[v0] selectedJo 변경 감지 - activeJo 업데이트:", selectedJo)
      setActiveJo(selectedJo)

      if (!isOrdinance && contentRef.current) {
        console.log("[v0] 법령 모드 - 스크롤 최상단 이동")
        setTimeout(() => {
          contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }, 100)
      }
      return
    }

    if (!activeArticle && firstArticleJo && activeJo !== firstArticleJo) {
      console.log("[v0] 현재 activeArticle 없음 - 첫 번째 조문으로 초기화:", firstArticleJo)
      setActiveJo(firstArticleJo)

      if (!isOrdinance && contentRef.current) {
        console.log("[v0] 조문 초기화 - 스크롤 최상단 이동")
        setTimeout(() => {
          contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }, 100)
      }
      return
    }

    if (articles.length === 1 && firstArticleJo && activeJo !== firstArticleJo) {
      console.log("[v0] 조문 1개 - 자동 선택:", firstArticleJo)
      setActiveJo(firstArticleJo)
    } else if (articles.length > 0 && !activeJo && firstArticleJo) {
      console.log("[v0] activeJo 없음 - 첫 번째 조문 선택:", firstArticleJo)
      setActiveJo(firstArticleJo)
    }
  }, [selectedJo, articles, isOrdinance, activeJo, activeArticle])

  const handleArticleClick = (article: LawArticle, index: number) => {
    const joValue = getArticleJo(article, index)
    console.log("[v0] 조문 클릭:", { jo: joValue, isOrdinance })

    if (!joValue) {
      console.log("[v0] 유효한 조문 식별자를 찾지 못해 클릭을 무시합니다")
      return
    }

    setActiveJo(joValue)

    if (isOrdinance) {
      console.log("[v0] 조례 모드 - 스크롤 이동")
      const element = articleRefs.current[joValue]
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 24))
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 2, 10))
  const resetFontSize = () => setFontSize(14)

  const openLawCenter = () => {
    if (!activeArticle) return
    const lawTitle = meta.lawTitle
    const fallbackIndex = activeArticleIndex >= 0 ? activeArticleIndex : undefined
    const articleNum =
      formatJO(activeArticle.jo) || formatSimpleJo(activeArticle, fallbackIndex)
    const url = `https://www.law.go.kr/법령/${lawTitle}/${articleNum}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const formatSimpleJo = (article: LawArticle, fallbackIndex?: number): string => {
    const joCode = getArticleJo(article, fallbackIndex)

    if (joCode) {
      const fullLabel = formatJO(joCode)
      if (fullLabel) {
        return fullLabel
      }
    }

    const joLabel = article.joNum?.trim()
    if (joLabel) {
      if (joLabel.startsWith("제")) {
        return joLabel
      }
      return `제${joLabel}`
    }

    if (typeof fallbackIndex === "number") {
      return `제${fallbackIndex + 1}조`
    }

    return "조문"
  }

  const formatHeadingLabel = (article: LawArticle, fallbackIndex?: number): string => {
    const label = formatSimpleJo(article, fallbackIndex)
    return article.title ? `${label} (${article.title})` : label
  }

  const renderArticleHeading = (
    article: LawArticle,
    fallbackIndex?: number,
    headingLevel: "h3" | "h4" = "h3",
  ) => {
    const label = formatSimpleJo(article, fallbackIndex)
    const idSource =
      article.jo ||
      article.joNum ||
      (typeof fallbackIndex === "number" ? String(fallbackIndex + 1) : undefined)
    const id = idSource ? `article-${idSource}` : undefined
    const content = (
      <>
        <span>{label}</span>
        {article.title && <span className="text-sm text-muted-foreground ml-2">({article.title})</span>}
      </>
    )

    if (headingLevel === "h4") {
      return (
        <h4 className="text-base font-semibold text-foreground mb-3" id={id}>
          {content}
        </h4>
      )
    }

    return (
      <h3 className="text-lg font-semibold text-foreground mb-3" id={id}>
        {content}
      </h3>
    )
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
              html: extractArticleText(found, { includeHeading: true, headingLevel: "h3" }),
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
          html: extractArticleText(found, { includeHeading: true, headingLevel: "h3" }),
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
    displayMode: isOrdinance ? "조례 (전체 조문)" : "법령 (선택 조문)",
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
            {articles.map((article, index) => {
              const joValue = getArticleJo(article, index)
              const key = joValue || article.joNum || `article-${index}`
              const isActive = joValue ? activeJo === joValue : !activeJo && index === 0

              return (
                <button
                  key={key}
                  onClick={() => handleArticleClick(article, index)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-baseline gap-1">
                      <span className="font-semibold text-foreground/90">
                        {formatSimpleJo(article, index)}
                      </span>
                      {article.title && (
                        <span className="text-xs text-muted-foreground">{article.title}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      {article.hasChanges && (
                        <AlertCircle className="h-3 w-3 text-[var(--color-warning)]" title="변경된 조문" />
                      )}
                      {joValue && favorites.has(joValue) && (
                        <Star className="h-3 w-3 fill-[var(--color-warning)]" />
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </Card>

      {/* Right panel - Article content */}
      <Card className="flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">
                  {meta.lawTitle}
                  {!isOrdinance && activeArticle && (
                    <span className="text-base font-normal text-muted-foreground ml-2">
                      {formatSimpleJo(
                        activeArticle,
                        activeArticleIndex >= 0 ? activeArticleIndex : undefined,
                      )}
                      {activeArticle.title && <span> ({activeArticle.title})</span>}
                    </span>
                  )}
                </h2>
              </div>
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
                  {articles.map((article, index) => {
                    const joValue = getArticleJo(article, index)
                    const key = joValue || article.joNum || `ordinance-article-${index}`

                    return (
                      <div
                        key={key}
                        ref={(el) => {
                          if (joValue) {
                            articleRefs.current[joValue] = el
                          }
                        }}
                        className="prose prose-sm max-w-none dark:prose-invert scroll-mt-4"
                      >
                        {renderArticleHeading(article, index)}
                        <div
                          className="whitespace-pre-wrap text-foreground leading-relaxed break-words"
                          style={{
                            fontSize: `${fontSize}px`,
                            lineHeight: "1.8",
                            overflowWrap: "break-word",
                            wordBreak: "break-word",
                          }}
                          onClick={handleContentClick}
                          dangerouslySetInnerHTML={{
                            __html: extractArticleText(article),
                          }}
                        />
                        <Separator className="my-6" />
                      </div>
                    )
                  })}

                  {articles.some((a) => a.revisionHistory && a.revisionHistory.length > 0) && (
                    <div className="mt-8 pt-8 border-t border-border">
                      <h3 className="text-lg font-semibold mb-4">개정 이력</h3>
                      {articles
                        .filter((a) => a.revisionHistory && a.revisionHistory.length > 0)
                        .map((article, idx) => {
                          const joValue = getArticleJo(article, idx)
                          const fallbackIndex = articles.findIndex((candidate, candidateIndex) =>
                            getArticleJo(candidate, candidateIndex) === joValue,
                          )
                          const heading = formatHeadingLabel(
                            article,
                            fallbackIndex >= 0 ? fallbackIndex : undefined,
                          )

                          return (
                            <div key={joValue || `ordinance-revision-${idx}`} className="mb-6">
                              <RevisionHistory history={article.revisionHistory!} articleTitle={heading} />
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              ) : activeArticle ? (
                /* 법령: 조문 번호와 제목을 명확히 표시하고 본문 표시 */
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {renderArticleHeading(
                    activeArticle,
                    activeArticleIndex >= 0 ? activeArticleIndex : undefined,
                  )}
                  <div
                    className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: "1.8",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                    onClick={handleContentClick}
                    dangerouslySetInnerHTML={{
                      __html: extractArticleText(activeArticle),
                    }}
                  />

                  {activeArticle.revisionHistory && activeArticle.revisionHistory.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-border">
                      <RevisionHistory
                        history={activeArticle.revisionHistory}
                        articleTitle={formatHeadingLabel(
                          activeArticle,
                          activeArticleIndex >= 0 ? activeArticleIndex : undefined,
                        )}
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
