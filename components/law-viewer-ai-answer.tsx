"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Sparkles,
    ShieldCheck,
    Link2,
    FileText,
    Bookmark,
    GitMerge,
    ExternalLink,
    AlertCircle,
    MessageCircleQuestion,
    ZoomOut,
    RotateCcw,
    ZoomIn,
    Copy,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { ParsedRelatedLaw } from "@/lib/law-parser"
import type { VerifiedCitation } from '@/lib/citation-verifier'
import { debugLogger } from '@/lib/debug-logger'

interface AIAnswerSidebarProps {
    relatedArticles: ParsedRelatedLaw[]
    onRelatedArticleClick: (lawName: string, article: string) => void
    onCloseSidebar?: () => void
    showHeader?: boolean
}

export function AIAnswerSidebar({
    relatedArticles,
    onRelatedArticleClick,
    onCloseSidebar,
    showHeader = true
}: AIAnswerSidebarProps) {
    return (
        <>
            {showHeader ? (
                <div className="border-b border-border p-4 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                        <Link2 className="h-5 w-5 text-primary" />
                        <h3 className="text-xl font-bold text-foreground">관련 법령 목록</h3>
                    </div>
                    <HeaderBadges relatedArticles={relatedArticles} />
                </div>
            ) : (
                <div className="mb-4">
                    <HeaderBadges relatedArticles={relatedArticles} />
                </div>
            )}

            <div className="flex-1 min-h-0">
                <ScrollArea className="h-full">
                    <div className="space-y-1 pr-4 px-4 pt-2 pb-4">
                        {relatedArticles.length > 0 ? (
                            (() => {
                                // 법령명+조문으로 그룹화 (같은 법령이 발췌+관련 둘 다 있을 수 있음)
                                const grouped = new Map<string, { law: ParsedRelatedLaw; sources: Set<string> }>()

                                relatedArticles.forEach(law => {
                                    const key = `${law.lawName}|${law.jo}`
                                    const existing = grouped.get(key)
                                    if (existing) {
                                        existing.sources.add(law.source)
                                    } else {
                                        grouped.set(key, { law, sources: new Set([law.source]) })
                                    }
                                })

                                return Array.from(grouped.values()).map(({ law, sources }, idx) => {
                                    const handleClick = () => {
                                        debugLogger.info('🔗 [사이드바] 법령 링크 클릭 - 모달로 열기', {
                                            lawName: law.lawName,
                                            jo: law.jo,
                                            article: law.article,
                                            sources: Array.from(sources)
                                        })

                                        // 사이드바 닫기 (모바일)
                                        onCloseSidebar?.()

                                        // ✅ 모달로 법령 조문 열기
                                        onRelatedArticleClick(law.lawName, law.article)
                                    }

                                    return (
                                        <button
                                            key={`${law.lawName}-${law.jo}-${idx}`}
                                            onClick={handleClick}
                                            className="w-full text-left pl-4 pr-5 py-3 rounded-md border border-blue-800/20 hover:border-blue-600/40 bg-gradient-to-r from-blue-950/20 to-purple-950/20 hover:from-blue-900/40 hover:to-purple-900/40 transition-all duration-200 group"
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-1.5 flex-1">
                                                    <ExternalLink className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-300 shrink-0 mt-0.5" />
                                                    <span className="font-medium text-blue-300 group-hover:text-blue-200 text-base">
                                                        {law.lawName}
                                                    </span>
                                                </div>
                                                {/* 출처 아이콘 (중복 시 여러 개 표시) */}
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {sources.has('excerpt') && (
                                                        <Bookmark className="h-3.5 w-3.5 text-purple-400" />
                                                    )}
                                                    {sources.has('related') && (
                                                        <Link2 className="h-3.5 w-3.5 text-blue-400" />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-sm text-muted-foreground pl-5">
                                                {law.article}
                                                {law.title && (
                                                    <span className="text-blue-400/70 ml-1">{law.title}</span>
                                                )}
                                            </div>
                                        </button>
                                    )
                                })
                            })()
                        ) : (
                            <div className="text-sm text-muted-foreground text-center py-8">
                                관련 법령이 없습니다
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </>
    )
}

function HeaderBadges({ relatedArticles }: { relatedArticles: ParsedRelatedLaw[] }) {
    // 중복 제거를 위한 그룹화 (카운트 계산용)
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

    // 중복 제거된 고유 조문 수
    const uniqueCount = grouped.size

    // 발췌만 있는 조문 수 (관련법령에도 있으면 제외)
    const excerptOnlyCount = Array.from(grouped.values()).filter(
        g => g.source.has('excerpt') && g.source.size === 1
    ).length

    // 관련법령만 있는 조문 수 (발췌에도 있으면 제외)
    const relatedOnlyCount = Array.from(grouped.values()).filter(
        g => g.source.has('related') && g.source.size === 1
    ).length

    // 둘 다 있는 조문 수
    const bothCount = Array.from(grouped.values()).filter(
        g => g.source.size === 2
    ).length

    return (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
                <FileText className="h-3 w-3 mr-1" />
                전체 {uniqueCount}개
            </Badge>
            {excerptOnlyCount > 0 && (
                <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700/50 whitespace-nowrap">
                    <Bookmark className="h-3 w-3 mr-1" />
                    발췌 {excerptOnlyCount}
                </Badge>
            )}
            {relatedOnlyCount > 0 && (
                <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-300 border-blue-700/50 whitespace-nowrap">
                    <Link2 className="h-3 w-3 mr-1" />
                    관련 {relatedOnlyCount}
                </Badge>
            )}
            {bothCount > 0 && (
                <Badge variant="outline" className="text-xs bg-green-900/30 text-green-300 border-green-700/50 whitespace-nowrap">
                    <GitMerge className="h-3 w-3 mr-1" />
                    둘 다 {bothCount}
                </Badge>
            )}
        </div>
    )
}

interface AIAnswerContentProps {
    aiAnswerHTML: string
    userQuery: string
    aiConfidenceLevel: 'high' | 'medium' | 'low'
    fileSearchFailed: boolean
    aiCitations: VerifiedCitation[]
    fontSize: number
    setFontSize: (size: number | ((prev: number) => number)) => void
    handleContentClick: React.MouseEventHandler<HTMLDivElement>
}

export function AIAnswerContent({
    aiAnswerHTML,
    userQuery,
    aiConfidenceLevel,
    fileSearchFailed,
    aiCitations,
    fontSize,
    setFontSize,
    handleContentClick
}: AIAnswerContentProps) {
    const { toast } = useToast()

    return (
        <div className="animate-fade-in-up">
            {/* 검색 실패 경고 메시지 - 간소화 */}
            {fileSearchFailed && (
                <div className="mb-4 p-3 bg-destructive/5 border border-destructive/20 rounded-md">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-destructive">검색 결과 없음</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                관련 법령을 찾지 못했습니다. 검색어를 확인해주세요.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-1 pb-5 border-b border-border">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 pt-2">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                            <h3 className="text-lg sm:text-xl font-bold text-foreground mb-0">AI 답변</h3>
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                                File Search RAG
                            </Badge>
                        </div>
                        {userQuery && (
                            <div className="flex items-start gap-1.5 text-sm sm:text-md text-muted-foreground font-medium pl-1">
                                <MessageCircleQuestion className="h-4 w-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                                <span className="break-words">{userQuery}</span>
                            </div>
                        )}
                    </div>

                    {/* AI 답변 컨트롤 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setFontSize((prev) => Math.max(12, prev - 2))} title="글자 작게">
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setFontSize(15)} title="기본 크기">
                            <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setFontSize((prev) => Math.min(20, prev + 2))} title="글자 크게">
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground mx-1">{fontSize}px</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                navigator.clipboard.writeText(aiAnswerHTML.replace(/<[^>]*>?/gm, '')) // Copy text only
                                toast({ title: "복사 완료", description: "AI 답변이 클립보드에 복사되었습니다." })
                            }}
                            title="복사"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                        {aiCitations && aiCitations.length > 0 && (() => {
                            // 중복 제거된 개수 계산
                            const uniqueCitations = new Map()
                            aiCitations.forEach(c => {
                                const key = `${c.lawName}|${c.articleNum}`
                                if (!uniqueCitations.has(key)) {
                                    uniqueCitations.set(key, c)
                                }
                            })
                            const verifiedCount = Array.from(uniqueCitations.values()).filter(c => c.verified).length
                            const totalUnique = uniqueCitations.size

                            return (
                                <div
                                    className={`
                    relative flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md cursor-help
                    transition-colors duration-200
                    ${aiConfidenceLevel === 'high'
                                            ? 'bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/30 dark:border-blue-400/30 hover:border-blue-500/50 dark:hover:border-blue-400/50'
                                            : aiConfidenceLevel === 'medium'
                                                ? 'bg-yellow-500/10 dark:bg-yellow-400/10 border border-yellow-500/30 dark:border-yellow-400/30 hover:border-yellow-500/50 dark:hover:border-yellow-400/50'
                                                : 'bg-red-500/10 dark:bg-red-400/10 border border-red-500/30 dark:border-red-400/30 hover:border-red-500/50 dark:hover:border-red-400/50'
                                        }
                  `}
                                    title={`AI 참조 조문: ${totalUnique}개\n실제 조문 존재: ${verifiedCount}개`}
                                >
                                    <ShieldCheck className={`h-4 w-4 ${aiConfidenceLevel === 'high'
                                            ? 'text-blue-400 dark:text-blue-300'
                                            : aiConfidenceLevel === 'medium'
                                                ? 'text-yellow-500 dark:text-yellow-400'
                                                : 'text-red-500 dark:text-red-400'
                                        }`} />
                                    <div className={`flex items-baseline gap-0.5 font-bold ${aiConfidenceLevel === 'high'
                                            ? 'text-blue-400 dark:text-blue-300'
                                            : aiConfidenceLevel === 'medium'
                                                ? 'text-yellow-500 dark:text-yellow-400'
                                                : 'text-red-500 dark:text-red-400'
                                        }`}>
                                        <span className="text-base tabular-nums leading-none">{verifiedCount}</span>
                                        <span className="opacity-40 text-xs leading-none">/</span>
                                        <span className="text-base tabular-nums leading-none">{totalUnique}</span>
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                </div>
            </div>

            <div
                className="prose prose-sm max-w-none w-full dark:prose-invert break-words overflow-x-hidden px-0
        [&_h2]:text-[clamp(18px,5vw,24px)] [&_h2]:font-bold [&_h2]:mt-[clamp(12px,3vw,20px)] [&_h2]:mb-2 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-1.5 [&_h2]:flex-nowrap
        [&_h3]:text-[clamp(14px,4vw,16px)] [&_h3]:font-semibold [&_h3]:mt-[clamp(8px,2vw,12px)] [&_h3]:mb-2 [&_h3]:flex [&_h3]:items-center [&_h3]:gap-1.5 [&_h3]:flex-nowrap
        [&_blockquote]:border-l-2 [&_blockquote]:border-blue-500/40 [&_blockquote]:bg-blue-950/30 [&_blockquote]:pl-2 sm:[&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:my-2 [&_blockquote]:ml-0 sm:[&_blockquote]:ml-4 [&_blockquote]:break-words [&_blockquote]:overflow-wrap-anywhere [&_blockquote]:not-italic
        [&_blockquote_p]:my-1 [&_blockquote_p]:leading-relaxed
        [&_ul]:my-2 sm:[&_ul]:my-3 [&_li]:my-1
        [&_ol]:my-2 sm:[&_ol]:my-3 [&_ol_li]:my-1
        [&_p]:leading-relaxed [&_p]:my-2 [&_p]:break-words"
                style={{ fontSize: `${fontSize}px`, overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                onClick={handleContentClick}
                dangerouslySetInnerHTML={{ __html: aiAnswerHTML }}
            />

            {/* AI 답변 주의사항 */}
            <div className="mt-6 flex items-start gap-2 text-xs text-amber-200/80 bg-amber-950/20 border border-amber-800/30 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p>이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다. 정확한 정보는 원문을 확인하거나 전문가와 상담하시기 바랍니다.</p>
            </div>
        </div>
    )
}
