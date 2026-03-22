"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import type { ParsedRelatedLaw } from "@/lib/law-parser"
import { debugLogger } from '@/lib/debug-logger'

function HeaderBadges({ relatedArticles }: { relatedArticles: ParsedRelatedLaw[] }) {
    const grouped = new Map<string, { source: Set<string> }>()
    relatedArticles.forEach(law => {
        const key = `${law.lawName}|${law.jo}`
        const existing = grouped.get(key)
        if (existing) {
            existing.source.add(law.source)
        } else {
            grouped.set(key, { source: new Set([law.source]) })
        }
    })

    const uniqueCount = grouped.size
    const excerptCount = Array.from(grouped.values()).filter(g => g.source.has('excerpt')).length
    const relatedCount = Array.from(grouped.values()).filter(g => g.source.has('related')).length
    const citationCount = Array.from(grouped.values()).filter(g => g.source.has('citation')).length

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="text-xs whitespace-nowrap px-2 py-0.5">
                <Icon name="file-text" size={12} className="mr-0.5" />
                {uniqueCount}
            </Badge>
            {excerptCount > 0 && (
                <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700/50 whitespace-nowrap px-2 py-0.5">
                    <Icon name="bookmark" size={12} className="mr-0.5" />
                    {excerptCount}
                </Badge>
            )}
            {relatedCount > 0 && (
                <Badge variant="outline" className="text-xs bg-[var(--revision-tag-bg)] text-[var(--revision-tag-fg)] border-[var(--revision-tag-border)] whitespace-nowrap px-2 py-0.5 shadow-none">
                    <Icon name="link-2" size={12} className="mr-0.5" />
                    {relatedCount}
                </Badge>
            )}
            {citationCount > 0 && (
                <Badge variant="outline" className="text-xs bg-emerald-200/40 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-300 border-emerald-600/50 dark:border-emerald-700/50 whitespace-nowrap px-2 py-0.5">
                    <Icon name="sparkles" size={12} className="mr-0.5" />
                    {citationCount}
                </Badge>
            )}
        </div>
    )
}

interface AIAnswerSidebarProps {
    relatedArticles: ParsedRelatedLaw[]
    onRelatedArticleClick: (lawName: string, article: string) => void
    onCloseSidebar?: () => void
    showHeader?: boolean
    onCollapseClick?: () => void
    isStreaming?: boolean
}

export function AIAnswerSidebar({
    relatedArticles,
    onRelatedArticleClick,
    onCloseSidebar,
    showHeader = true,
    onCollapseClick,
    isStreaming = false
}: AIAnswerSidebarProps) {
    const [hydratedTitles, setHydratedTitles] = useState<Record<string, string | null>>({})

    const groupedEntries = useMemo(() => {
        if (isStreaming) return []
        const validArticles = relatedArticles.filter(law =>
            law.lawName &&
            law.lawName !== '알 수 없음' &&
            law.lawName.length <= 50
        )

        const grouped = new Map<string, { law: ParsedRelatedLaw; sources: Set<string> }>()

        validArticles.forEach(law => {
            const key = `${law.lawName}|${law.jo || 'all'}`
            const existing = grouped.get(key)
            if (existing) {
                existing.sources.add(law.source)
                if (!existing.law.title && law.title) existing.law.title = law.title
                if (!existing.law.fullText && law.fullText) existing.law.fullText = law.fullText
                if (existing.law.title && !existing.law.display.includes(existing.law.title)) {
                    existing.law.display = `${existing.law.lawName} ${existing.law.article} ${existing.law.title}`.trim()
                }
            } else {
                grouped.set(key, { law: { ...law }, sources: new Set([law.source]) })
            }
        })

        return Array.from(grouped.entries()).map(([key, value]) => ({ key, ...value }))
    }, [relatedArticles, isStreaming])

    const missingTitleRequests = useMemo(() => {
        if (isStreaming) return []
        return groupedEntries
            .filter(({ key, law }) => {
                const alreadyHydrated = Object.prototype.hasOwnProperty.call(hydratedTitles, key)
                return !alreadyHydrated && !law.title && !!law.lawName && !!law.article
            })
            .map(({ key, law }) => ({ key, lawName: law.lawName, article: law.article }))
    }, [groupedEntries, hydratedTitles, isStreaming])

    useEffect(() => {
        if (isStreaming) return
        if (missingTitleRequests.length === 0) return

        let canceled = false

        const run = async () => {
            const batch = missingTitleRequests.slice(0, 10)

            await Promise.all(batch.map(async ({ key, lawName, article }) => {
                try {
                    const qs = new URLSearchParams({ lawName, article })
                    const res = await fetch(`/api/article-title?${qs.toString()}`)
                    if (!res.ok) {
                        if (!canceled) {
                            setHydratedTitles(prev => ({ ...prev, [key]: null }))
                        }
                        return
                    }
                    const data = (await res.json()) as { title?: string | null }
                    const title = typeof data?.title === 'string' && data.title.trim() ? data.title.trim() : null

                    if (!canceled) {
                        setHydratedTitles(prev => ({ ...prev, [key]: title }))
                    }
                } catch (e) {
                    if (!canceled) {
                        setHydratedTitles(prev => ({ ...prev, [key]: null }))
                    }
                }
            }))
        }

        run()

        return () => {
            canceled = true
        }
    }, [missingTitleRequests, isStreaming])

    return (
        <>
            {showHeader ? (
                <div className="border-b border-border px-4 pt-6 pb-3 flex-shrink-0">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                            <Icon name="link-2" size={20} className="text-brand-navy" />
                            <h3 className="text-xl font-bold text-foreground">관련 법령</h3>
                        </div>
                        {onCollapseClick && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onCollapseClick}
                                className="h-7 w-7"
                                title="목록 접기"
                            >
                                <Icon name="chevron-down" size={16} className="rotate-90" />
                            </Button>
                        )}
                    </div>
                    <HeaderBadges relatedArticles={relatedArticles} />
                </div>
            ) : (
                <div className="mb-3 px-4">
                    <h3 className="text-lg font-bold text-foreground mb-2">관련 법령</h3>
                    <HeaderBadges relatedArticles={relatedArticles} />
                </div>
            )}

            <div className="flex-1 min-h-0 px-2 pt-3 pb-4 overflow-y-auto">
                {isStreaming ? (
                    <div className="space-y-2.5 px-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="p-3 rounded-lg border border-border/50 bg-muted/30 animate-pulse">
                                <div className="h-3.5 bg-muted rounded w-3/4 mb-2" />
                                <div className="h-3 bg-muted rounded w-1/2" />
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground text-center pt-2">관련 법령을 찾고 있습니다...</p>
                    </div>
                ) : (
                <div className="space-y-2">
                    {relatedArticles.length > 0 ? (
                        (() => {
                            return groupedEntries.map(({ key, law, sources }, idx) => {
                                const handleClick = () => {
                                    debugLogger.info('🔗 [사이드바] 법령 링크 클릭 - 모달로 열기', {
                                        lawName: law.lawName,
                                        jo: law.jo,
                                        article: law.article,
                                        sources: Array.from(sources)
                                    })

                                    onCloseSidebar?.()
                                    onRelatedArticleClick(law.lawName, law.article)
                                }

                                return (
                                    <button
                                        key={`${law.lawName}-${law.jo}-${idx}`}
                                        onClick={handleClick}
                                        className="group relative w-full max-w-full text-left px-2 py-2 rounded-md transition-colors hover:bg-secondary text-foreground overflow-hidden box-border"
                                    >
                                        <div className="relative flex items-start gap-2.5 w-full">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-base font-bold font-ridi leading-tight mb-0.5 break-words pr-12">
                                                    <span className="text-foreground">{law.lawName}</span>
                                                    {' '}
                                                    <span className="text-foreground">{law.article}</span>
                                                </div>
                                                <div className="text-sm font-pretendard text-gray-600 dark:text-gray-400 truncate opacity-90">
                                                    {(() => {
                                                        const hydrated = hydratedTitles[key]
                                                        const title = law.title || hydrated
                                                        if (typeof title === 'string' && title.trim()) {
                                                            return title.replace(/^\(|\)$/g, '')
                                                        }
                                                        if (Object.prototype.hasOwnProperty.call(hydratedTitles, key) && hydrated === null) {
                                                            return '제목 없음'
                                                        }
                                                        return '조문 제목 불러오는 중…'
                                                    })()}
                                                </div>
                                            </div>

                                            <div className="absolute top-0 right-0 flex items-start gap-1">
                                                {sources.has('excerpt') && (
                                                    <div className="p-1 rounded-md bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20 transition-colors" title="발췌 조문">
                                                        <Icon name="bookmark" size={14} />
                                                    </div>
                                                )}
                                                {sources.has('related') && (
                                                    <div className="p-1 rounded-md bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors" title="관련 법령">
                                                        <Icon name="link-2" size={14} />
                                                    </div>
                                                )}
                                                {sources.has('citation') && (
                                                    <div className="p-1 rounded-md bg-emerald-600/20 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-500 group-hover:bg-emerald-600/30 dark:group-hover:bg-emerald-500/20 transition-colors" title="AI 인용 출처">
                                                        <Icon name="sparkles" size={14} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })
                        })()
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60 gap-2">
                            <Icon name="alert-circle" size={32} className="opacity-40 text-amber-500" />
                            <p className="text-sm font-medium text-amber-600">인용 조문 없음</p>
                            <p className="text-xs text-center px-4">AI가 일반 지식으로 답변했습니다.<br />법령 데이터베이스에서 관련 조문을 찾지 못했습니다.</p>
                        </div>
                    )}
                </div>
                )}
            </div>
        </>
    )
}
