"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import dynamic from 'next/dynamic'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Icon, DynamicIcon, ICON_REGISTRY, type IconType } from "@/components/ui/icon"
import { CopyButton } from "@/components/ui/copy-button"
import type { ParsedRelatedLaw } from "@/lib/law-parser"
import type { VerifiedCitation } from '@/lib/citation-verifier'
import { debugLogger } from '@/lib/debug-logger'
import { LegalMarkdownRenderer } from '@/components/legal-markdown-renderer'

import type { ToolCallLogEntry, ConversationEntry } from "@/components/search-result-view/types"

// Dynamic import for AnnexModal (별표 모달)
const AnnexModal = dynamic(
  () => import("@/components/annex-modal").then(m => m.AnnexModal),
  { ssr: false }
)

interface AIAnswerSidebarProps {
    relatedArticles: ParsedRelatedLaw[]
    onRelatedArticleClick: (lawName: string, article: string) => void
    onCloseSidebar?: () => void
    showHeader?: boolean
    onCollapseClick?: () => void
    isStreaming?: boolean  // ✅ 로딩 중 여부
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
        // ✅ 로딩 중이면 빈 배열 반환
        if (isStreaming) return []
        // 1. 필터링: "알 수 없음", 너무 긴 법령명(파싱 오류) 제외
        const validArticles = relatedArticles.filter(law =>
            law.lawName &&
            law.lawName !== '알 수 없음' &&
            law.lawName.length <= 50 // 법령명이 50자 이상이면 파싱 오류
        )

        // 2. 법령명+조문으로 그룹화 (같은 법령이 발췌+관련 둘 다 있을 수 있음)
        // NOTE: 같은 key에 title이 있는 항목이 뒤늦게 들어오는 경우가 있어, title/fullText 등은 "더 풍부한" 값으로 병합한다.
        const grouped = new Map<string, { law: ParsedRelatedLaw; sources: Set<string> }>()

        validArticles.forEach(law => {
            const key = `${law.lawName}|${law.jo || 'all'}`
            const existing = grouped.get(key)
            if (existing) {
                existing.sources.add(law.source)

                // ✅ 제목/전문이 없는 케이스 보완: 더 풍부한 값으로 업그레이드
                if (!existing.law.title && law.title) existing.law.title = law.title
                if (!existing.law.fullText && law.fullText) existing.law.fullText = law.fullText

                // title이 생겼다면 display도 보완 (UI에서는 display를 직접 쓰진 않지만, 데이터 정합성 유지)
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
        // ✅ 로딩 중이면 빈 배열 반환
        if (isStreaming) return []
        return groupedEntries
            .filter(({ key, law }) => {
                const alreadyHydrated = Object.prototype.hasOwnProperty.call(hydratedTitles, key)
                return !alreadyHydrated && !law.title && !!law.lawName && !!law.article
            })
            .map(({ key, law }) => ({ key, lawName: law.lawName, article: law.article }))
    }, [groupedEntries, hydratedTitles, isStreaming])

    useEffect(() => {
        // ✅ 로딩 중이면 useEffect 스킵
        if (isStreaming) return
        if (missingTitleRequests.length === 0) return

        let canceled = false

        const run = async () => {
            // 너무 많은 호출 방지: 한 번에 최대 10개만 hydrate
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

    // ✅ 디버깅: isStreaming 상태 확인
    useEffect(() => {
        console.log('🔄 [AIAnswerSidebar] isStreaming:', isStreaming)
    }, [isStreaming])

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
                {/* ✅ 로딩 중이면 스피너만 표시 */}
                {isStreaming ? (
                    <div className="flex items-center justify-center h-full py-12">
                        <Icon name="loader" className="h-8 w-8 animate-spin text-primary" />
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

                                    // 사이드바 닫기 (모바일)
                                    onCloseSidebar?.()

                                    // ✅ 모달로 법령 조문 열기
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
                                                {/* 법령명 + 조문번호 (한 줄, 조문번호 색상 다르게) */}
                                                <div className="text-base font-bold font-ridi leading-tight mb-0.5 break-words pr-12">
                                                    <span className="text-foreground">{law.lawName}</span>
                                                    {' '}
                                                    <span className="text-foreground">{law.article}</span>
                                                </div>
                                                {/* 조문제목 - 괄호 제거 */}
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

                                            {/* Icon Indicator - 우측 상단 절대 위치 */}
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

    // 중복 제거된 고유 조문 수 (총 개수)
    const uniqueCount = grouped.size

    // 각 source를 포함하는 조문 수 (중복 허용 - 같은 조문이 여러 source에 있어도 각각 카운트)
    const excerptCount = Array.from(grouped.values()).filter(g => g.source.has('excerpt')).length
    const relatedCount = Array.from(grouped.values()).filter(g => g.source.has('related')).length
    const citationCount = Array.from(grouped.values()).filter(g => g.source.has('citation')).length

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {/* 총 개수 */}
            <Badge variant="secondary" className="text-xs whitespace-nowrap px-2 py-0.5">
                <Icon name="file-text" size={12} className="mr-0.5" />
                {uniqueCount}
            </Badge>
            {/* 발췌 조문 (해당 source를 포함하는 모든 조문) */}
            {excerptCount > 0 && (
                <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700/50 whitespace-nowrap px-2 py-0.5">
                    <Icon name="bookmark" size={12} className="mr-0.5" />
                    {excerptCount}
                </Badge>
            )}
            {/* 관련 법령 (해당 source를 포함하는 모든 조문) */}
            {relatedCount > 0 && (
                <Badge variant="outline" className="text-xs bg-[var(--revision-tag-bg)] text-[var(--revision-tag-fg)] border-[var(--revision-tag-border)] whitespace-nowrap px-2 py-0.5 shadow-none">
                    <Icon name="link-2" size={12} className="mr-0.5" />
                    {relatedCount}
                </Badge>
            )}
            {/* AI 인용 (해당 source를 포함하는 모든 조문) */}
            {citationCount > 0 && (
                <Badge variant="outline" className="text-xs bg-emerald-200/40 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-300 border-emerald-600/50 dark:border-emerald-700/50 whitespace-nowrap px-2 py-0.5">
                    <Icon name="sparkles" size={12} className="mr-0.5" />
                    {citationCount}
                </Badge>
            )}
        </div>
    )
}

interface AIAnswerContentProps {
    aiAnswerContent: string  // ✅ Phase 8: 원본 Markdown (HTML 대신)
    userQuery: string
    aiConfidenceLevel: 'high' | 'medium' | 'low'
    fileSearchFailed: boolean
    aiCitations: VerifiedCitation[]
    fontSize: number
    setFontSize: (size: number | ((prev: number) => number)) => void
    onLawClick?: (lawName: string, article?: string) => void  // ✅ 법령 링크 클릭 핸들러
    aiQueryType?: 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence' | 'scope' | 'exemption'  // ✅ 8가지 법률 질문 유형
    isTruncated?: boolean  // ✅ Phase 7: 답변 잘림 여부
    onRefresh?: () => void  // ✅ 강제 새로고침 (캐시 무시)

    // SSE 스트리밍
    isStreaming?: boolean
    searchProgress?: number
    toolCallLogs?: ToolCallLogEntry[]

    // 별표 모달
    currentLawName?: string

    // 연속 대화
    conversationHistory?: ConversationEntry[]
    onFollowUp?: (query: string) => void
    onNewConversation?: () => void
}



export function AIAnswerContent({
    aiAnswerContent,
    userQuery,
    aiConfidenceLevel,
    fileSearchFailed,
    aiCitations,
    fontSize,
    setFontSize,
    onLawClick,
    aiQueryType = 'application',
    isTruncated = false,
    onRefresh,
    isStreaming = false,
    searchProgress = 0,
    toolCallLogs = [],
    currentLawName,
    conversationHistory = [],
    onFollowUp,
    onNewConversation,
}: AIAnswerContentProps) {
    // 어절 단위 타이핑 효과
    const [displayedContent, setDisplayedContent] = useState('')
    const [isTyping, setIsTyping] = useState(false)

    // follow-up 입력
    const [followUpInput, setFollowUpInput] = useState('')

    // 도구 로그 접힘 애니메이션
    const [isCollapsing, setIsCollapsing] = useState(false)
    const [showLogs, setShowLogs] = useState(false)
    const [showDetails, setShowDetails] = useState(false)  // 완료 후 세부정보 토글
    const logPanelRef = useRef<HTMLDivElement>(null)
    const prevStreamingRef = useRef(isStreaming)

    // 스트리밍 시작 시 로그 표시, 완료 시 자동 접기
    useEffect(() => {
      if (isStreaming) {
        setShowLogs(true)
        setShowDetails(false)
      } else if (prevStreamingRef.current && !isStreaming) {
        // 스트리밍 완료: 로그 접기 애니메이션
        setIsCollapsing(true)
        const timer = setTimeout(() => {
          setShowLogs(false)
          setIsCollapsing(false)
        }, 600)
        return () => clearTimeout(timer)
      }
      prevStreamingRef.current = isStreaming
    }, [isStreaming])

    // 스트리밍 경과 시간 타이머
    const [streamElapsed, setStreamElapsed] = useState(0)
    const streamStartRef = useRef<number | null>(null)

    useEffect(() => {
      if (isStreaming) {
        if (!streamStartRef.current) {
          streamStartRef.current = Date.now()
          setStreamElapsed(0)
        }
        const interval = setInterval(() => {
          if (streamStartRef.current) {
            setStreamElapsed((Date.now() - streamStartRef.current) / 1000)
          }
        }, 100)
        return () => clearInterval(interval)
      } else {
        streamStartRef.current = null
      }
    }, [isStreaming])

    // 별표 모달 상태
    const [annexModal, setAnnexModal] = useState<{
        open: boolean
        annexNumber: string
        lawName: string
    }>({
        open: false,
        annexNumber: '',
        lawName: '',
    })

    // ✅ 별표 모달 열기 핸들러
    const handleAnnexClick = (annexNumber: string, lawName: string) => {
        const safeLawName = lawName && lawName !== 'undefined' ? lawName : ''
        debugLogger.info('🔗 [AI답변] 별표 링크 클릭', { annexNumber, lawName: safeLawName })
        setAnnexModal({
            open: true,
            annexNumber,
            lawName: safeLawName,
        })
    }

    // ✅ 별표 모달 닫기
    const closeAnnexModal = () => {
        setAnnexModal({
            open: false,
            annexNumber: '',
            lawName: '',
        })
    }

    useEffect(() => {
        if (!isStreaming && aiAnswerContent) {
            setIsTyping(true)
            setDisplayedContent('')

            // 청크 기반: 16ms(1프레임)마다 20어절씩 → ~60fps, 재렌더 횟수 대폭 감소
            const words = aiAnswerContent.split(' ')
            let pos = 0
            const CHUNK = 20

            const tick = () => {
                pos = Math.min(pos + CHUNK, words.length)
                setDisplayedContent(words.slice(0, pos).join(' '))
                if (pos < words.length) {
                    rafId = requestAnimationFrame(tick)
                } else {
                    setIsTyping(false)
                }
            }

            let rafId = requestAnimationFrame(tick)
            return () => cancelAnimationFrame(rafId)
        }
    }, [isStreaming, aiAnswerContent])

    // 신뢰도 배지 컴포넌트
    const ConfidenceBadge = () => {
        if (!aiCitations || aiCitations.length === 0) return null

        // 중복 제거된 개수 계산
        const uniqueCitations = new Map()
        aiCitations.forEach(c => {
            const key = `${c.lawName}|${c.articleNum}`
            if (!uniqueCitations.has(key)) {
                uniqueCitations.set(key, c)
            }
        })
        const totalUnique = uniqueCitations.size

        // verified 필드가 있으면 사용, 없으면 총 개수를 신뢰도로 표시
        const hasVerifiedField = aiCitations.some(c => c.verified !== undefined)
        const verifiedCount = hasVerifiedField
            ? Array.from(uniqueCitations.values()).filter(c => c.verified).length
            : totalUnique  // verified 필드 없으면 총 개수 표시

        // 실제 비율 기반 신뢰도 계산 (verified 필드 없으면 총 개수 기반)
        const confidenceRatio = hasVerifiedField
            ? (totalUnique > 0 ? verifiedCount / totalUnique : 0)
            : (totalUnique >= 3 ? 1 : totalUnique >= 1 ? 0.5 : 0)
        const localConfidence = confidenceRatio >= 0.7 ? 'high' : confidenceRatio >= 0.3 ? 'medium' : 'low'

        return (
            <div
                className={`
                    relative flex items-center gap-1 px-1.5 py-0.5 rounded cursor-help
                    transition-colors duration-200
                    ${localConfidence === 'high'
                        ? 'bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/30 dark:border-blue-400/30'
                        : localConfidence === 'medium'
                            ? 'bg-yellow-500/10 dark:bg-yellow-400/10 border border-yellow-500/30 dark:border-yellow-400/30'
                            : 'bg-red-500/10 dark:bg-red-400/10 border border-red-500/30 dark:border-red-400/30'
                    }
                `}
                title={hasVerifiedField
                    ? `AI 참조 조문: ${totalUnique}개\n실제 조문 존재: ${verifiedCount}개`
                    : `AI 참조 조문: ${totalUnique}개`
                }
            >
                <Icon name="shield-check" size={14} className={localConfidence === 'high'
                    ? 'text-blue-400 dark:text-blue-300'
                    : localConfidence === 'medium'
                        ? 'text-yellow-500 dark:text-yellow-400'
                        : 'text-red-500 dark:text-red-400'
                } />
                <div className={`flex items-baseline gap-0.5 font-bold ${localConfidence === 'high'
                    ? 'text-blue-400 dark:text-blue-300'
                    : localConfidence === 'medium'
                        ? 'text-yellow-500 dark:text-yellow-400'
                        : 'text-red-500 dark:text-red-400'
                    }`}>
                    {hasVerifiedField ? (
                        <>
                            <span className="text-sm tabular-nums leading-none">{verifiedCount}</span>
                            <span className="opacity-40 text-[10px] leading-none">/</span>
                            <span className="text-sm tabular-nums leading-none">{totalUnique}</span>
                        </>
                    ) : (
                        <span className="text-sm tabular-nums leading-none">{totalUnique}</span>
                    )}
                </div>
            </div>
        )
    }

    // 검색 완료 후 통계 계산
    const searchStats = useMemo(() => {
        if (isStreaming || toolCallLogs.length === 0) return null
        const calls = toolCallLogs.filter(l => l.type === 'call')
        const toolNames = new Map<string, number>()
        calls.forEach(l => {
            const name = l.displayName || l.name || 'unknown'
            toolNames.set(name, (toolNames.get(name) || 0) + 1)
        })
        const tokenLog = toolCallLogs.find(l => l.type === 'token_usage')
        return {
            totalCalls: calls.length,
            uniqueTools: toolNames.size,
            toolBreakdown: Array.from(toolNames.entries()),
            totalTokens: tokenLog?.totalTokens,
        }
    }, [isStreaming, toolCallLogs])

    return (
        <div className="w-full max-w-full min-w-0 overflow-hidden">
            {/* 헤더 - 모바일 3줄 / PC 2줄 */}
            <div className="border-b border-border px-3 sm:px-4 pt-4 sm:pt-6 pb-1 flex-shrink-0 flex flex-col gap-1 lg:gap-2">
                {/* 1줄: 타이틀+배지+신뢰도 */}
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Icon name="sparkles" size={20} className="text-brand-navy flex-shrink-0" />
                    <h3 className="text-xl font-bold text-foreground whitespace-nowrap">AI 답변</h3>
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                        Real-time Legal AI
                    </Badge>
                    {/* 신뢰도 배지 - RAG 배지 바로 옆 */}
                    <ConfidenceBadge />
                    {/* 검색 통계 아이콘 (완료 후 표시, hover 시 상세) */}
                    {searchStats && streamElapsed > 0 && (
                        <div className="relative group flex-shrink-0">
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/30 text-[11px] text-muted-foreground/60 cursor-default hover:text-muted-foreground hover:border-border/50 transition-colors">
                                <Icon name="zap" size={12} />
                                <span className="tabular-nums">{streamElapsed.toFixed(1)}s</span>
                                <span className="opacity-30">·</span>
                                <Icon name="settings" size={10} />
                                <span className="tabular-nums">{searchStats.totalCalls}</span>
                            </div>
                            {/* Hover 상세 팝업 */}
                            <div className="absolute top-full left-0 mt-1.5 hidden group-hover:block z-50">
                                <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[190px] text-xs space-y-1.5">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-muted-foreground flex items-center gap-1.5"><Icon name="clock" size={12} />소요 시간</span>
                                        <span className="font-medium tabular-nums">{streamElapsed.toFixed(1)}초</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-muted-foreground flex items-center gap-1.5"><Icon name="settings" size={12} />도구 호출</span>
                                        <span className="font-medium tabular-nums">{searchStats.totalCalls}회</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-muted-foreground flex items-center gap-1.5"><Icon name="database" size={12} />도구 종류</span>
                                        <span className="font-medium tabular-nums">{searchStats.uniqueTools}개</span>
                                    </div>
                                    {searchStats.totalTokens && (
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-muted-foreground flex items-center gap-1.5"><Icon name="bar-chart" size={12} />토큰</span>
                                            <span className="font-medium tabular-nums">{searchStats.totalTokens.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {searchStats.toolBreakdown.length > 0 && (
                                        <>
                                            <div className="h-px bg-border/40 my-1" />
                                            <div className="space-y-1">
                                                {searchStats.toolBreakdown.map(([name, count]) => (
                                                    <div key={name} className="flex items-center justify-between text-muted-foreground/70">
                                                        <span className="truncate max-w-[130px]">{name}</span>
                                                        <span className="tabular-nums ml-2 text-foreground/60">{count}회</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2줄: 질문 표시 + 쿼리 타입 배지 + PC 버튼들 우측 */}
                {userQuery && (
                    <div className="flex items-start gap-1.5 text-md text-muted-foreground font-medium min-w-0 max-w-full">
                        <Icon name="message-circle-question" size={20} className="text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                        {/* 질의 + 쿼리 타입 배지 (바로 옆에) */}
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                            <span className="break-words line-clamp-3">{userQuery}</span>
                            {/* 쿼리 타입 배지 (7가지 법률 질문 유형) */}
                            {(() => {
                                const typeConfigs: Record<string, { icon: IconType, label: string, bgColor: string, borderColor: string, textColor: string }> = {
                                    definition: { icon: ICON_REGISTRY['circle-help'], label: '개념/정의', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30', textColor: 'text-cyan-500' },
                                    requirement: { icon: ICON_REGISTRY['clipboard-check'], label: '요건/조건', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30', textColor: 'text-orange-500' },
                                    procedure: { icon: ICON_REGISTRY['list-checks'], label: '절차/방법', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', textColor: 'text-green-500' },
                                    comparison: { icon: ICON_REGISTRY['git-compare'], label: '비교', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30', textColor: 'text-purple-500' },
                                    application: { icon: ICON_REGISTRY['scale'], label: '적용 판단', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30', textColor: 'text-blue-500' },
                                    consequence: { icon: ICON_REGISTRY['zap'], label: '효과/결과', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/30', textColor: 'text-rose-500' },
                                    scope: { icon: ICON_REGISTRY['ruler'], label: '범위/금액', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30', textColor: 'text-amber-500' },
                                    exemption: { icon: ICON_REGISTRY['shield'], label: '면제/특례', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', textColor: 'text-emerald-500' }
                                }
                                const config = typeConfigs[aiQueryType] || typeConfigs.application

                                return (
                                    <Badge variant="outline" className={`flex-shrink-0 text-xs px-2 py-0.5 ${config.bgColor} ${config.borderColor} ${config.textColor}`}>
                                        <DynamicIcon icon={config.icon} size={12} className="mr-1" />
                                        {config.label}
                                    </Badge>
                                )
                            })()}
                        </div>
                        {/* PC: 버튼들 우측 정렬 */}
                        <div className="hidden lg:flex items-center gap-1 ml-auto flex-shrink-0">
                            {/* ✅ 강제 새로고침 버튼 (개발용) */}
                            {onRefresh && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
                                    <Icon name="refresh-cw" size={16} />
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFontSize((prev) => Math.max(12, prev - 2))} title="글자 작게">
                                <Icon name="zoom-out" size={16} />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFontSize(15)} title="기본 크기">
                                <Icon name="rotate-clockwise" size={12} />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFontSize((prev) => Math.min(20, prev + 2))} title="글자 크게">
                                <Icon name="zoom-in" size={16} />
                            </Button>
                            <span className="text-xs text-muted-foreground mx-1 tabular-nums">{fontSize}px</span>
                            <CopyButton
                                getText={() => aiAnswerContent}
                                message="복사됨"
                                className="h-8 w-8 p-0"
                            />
                        </div>
                    </div>
                )} { /* userQuery end */}

                {/* 3줄: 모바일 전용 컨트롤 버튼들 (우측 정렬) */}
                <div className="flex lg:hidden items-center justify-end gap-1">
                    {/* ✅ 강제 새로고침 버튼 (개발용) */}
                    {onRefresh && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
                            <Icon name="refresh-cw" size={16} />
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFontSize((prev) => Math.max(12, prev - 2))} title="글자 작게">
                        <Icon name="zoom-out" size={16} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFontSize(15)} title="기본 크기">
                        <Icon name="rotate-clockwise" size={12} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFontSize((prev) => Math.min(20, prev + 2))} title="글자 크게">
                        <Icon name="zoom-in" size={16} />
                    </Button>
                    <span className="text-xs text-muted-foreground mx-1 tabular-nums">{fontSize}px</span>
                    <CopyButton
                        getText={() => aiAnswerContent}
                        message="복사됨"
                        className="h-8 w-8 p-0"
                    />
                </div>
            </div>

            {/* 본문 영역 */}
            <div className="flex-1 min-h-0 px-3 sm:px-4 pt-2 pb-4 overflow-y-auto overflow-x-hidden w-full max-w-full">
                {/* 연속 대화 히스토리 */}
                {conversationHistory.length > 0 && (
                    <div className="mb-4 space-y-3">
                        {conversationHistory.map((entry) => (
                            <HistoryEntry key={entry.id} entry={entry} fontSize={fontSize} onLawClick={onLawClick} />
                        ))}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                            <div className="flex-1 h-px bg-border/30" />
                            <span>현재 답변</span>
                            <div className="flex-1 h-px bg-border/30" />
                        </div>
                    </div>
                )}

                {/* ✅ Phase 7: 신뢰도 경고 배너 (low일 때) */}
                {aiConfidenceLevel === 'low' && !fileSearchFailed && (
                    <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-md">
                        <div className="flex items-center gap-2 text-red-500 text-sm">
                            <Icon name="alert-triangle" size={16} className="flex-shrink-0" />
                            <span>참조 조문 부족. 일반 지식 기반 답변</span>
                        </div>
                    </div>
                )}

                {/* ✅ Phase 7: 답변 잘림 경고 (MAX_TOKENS) */}
                {isTruncated && (
                    <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-md">
                        <div className="flex items-center gap-2 text-amber-500 text-sm">
                            <Icon name="alert-triangle" size={16} className="flex-shrink-0" />
                            <span>답변이 길어 일부 생략됨</span>
                        </div>
                    </div>
                )}

                {/* 검색 실패 경고 메시지 */}
                {fileSearchFailed && (
                    <div className="mb-4 p-3 bg-destructive/5 border border-destructive/20 rounded-md">
                        <div className="flex items-start gap-2">
                            <Icon name="alert-circle" size={16} className="text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-destructive">검색 결과 없음</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    관련 법령을 찾지 못했습니다. 검색어를 확인해주세요.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* SSE 도구 호출 로그 패널 — 영향분석 스타일 */}
                {(showLogs || isStreaming) && (
                    <div
                        ref={logPanelRef}
                        className={`overflow-hidden mb-4 transition-all duration-600 ease-out ${
                            isCollapsing ? 'max-h-0 opacity-0 -translate-y-4' : 'max-h-[600px] opacity-100'
                        }`}
                    >
                        <div className="rounded-xl bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-800 p-4 sm:p-5">
                            {/* 헤더: 프로그레스 바 + 상태 */}
                            {isStreaming && (
                                <>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI 분석 진행 중</span>
                                        <span className="text-sm font-medium text-gray-500 tabular-nums">{Math.round(searchProgress)}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-4">
                                        <div
                                            className="h-full bg-gradient-to-r from-brand-navy to-brand-gold rounded-full transition-all duration-500 ease-out"
                                            style={{ width: `${Math.round(searchProgress)}%` }}
                                        />
                                    </div>
                                </>
                            )}

                            {/* 단계별 타임라인 */}
                            <div className="space-y-1.5">
                                <AiStepTimeline toolCallLogs={toolCallLogs} isStreaming={isStreaming} />
                            </div>
                        </div>
                    </div>
                )}

                {/* 완료 후 요약 바 + 세부정보 토글 */}
                {!isStreaming && searchStats && streamElapsed > 0 && (
                    <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-400">
                        {/* 요약 바 */}
                        <button
                            type="button"
                            onClick={() => setShowDetails(prev => !prev)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors text-left group"
                        >
                            <Icon name="check-circle" size={15} className="text-emerald-500 flex-shrink-0" />
                            <span className="text-[12px] font-medium text-foreground/80">완료</span>
                            <span className="text-[12px] font-mono tabular-nums text-muted-foreground">{streamElapsed.toFixed(1)}s</span>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="text-[12px] text-muted-foreground">
                                <Icon name="settings" size={11} className="inline mr-0.5" />
                                {searchStats.totalCalls}회 호출
                            </span>
                            {searchStats.totalTokens && (
                                <>
                                    <span className="text-muted-foreground/30">·</span>
                                    <span className="text-[12px] text-muted-foreground tabular-nums">
                                        {searchStats.totalTokens.toLocaleString()} 토큰
                                    </span>
                                </>
                            )}
                            <span className="ml-auto flex-shrink-0">
                                <Icon
                                    name={showDetails ? 'chevron-up' : 'chevron-down'}
                                    size={14}
                                    className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors"
                                />
                            </span>
                        </button>

                        {/* 세부정보: 영향분석 스타일 타임라인 */}
                        <div className={`overflow-hidden transition-all duration-400 ease-out ${showDetails ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                            <div className="rounded-xl bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-800 p-4">
                                {/* 도구별 통계 pill */}
                                {searchStats.toolBreakdown.length > 0 && (
                                    <div className="mb-3 pb-2.5 border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex flex-wrap gap-1.5">
                                            {searchStats.toolBreakdown.map(([name, count]) => (
                                                <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-muted-foreground">
                                                    {name} <span className="font-mono tabular-nums font-medium">{count}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 완료된 단계 타임라인 */}
                                <div className="space-y-1.5">
                                    <AiStepTimeline toolCallLogs={toolCallLogs} isStreaming={false} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ✅ Phase 7: 답변 내용이 없을 때 (스트리밍 완료 후에도 없을 때) */}
                {!aiAnswerContent && !isStreaming && (
                    <>
                        {/* 신뢰도 낮음 배너 */}
                        <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-md">
                            <div className="flex items-center gap-2 text-red-500 text-sm">
                                <Icon name="alert-triangle" size={16} className="flex-shrink-0" />
                                <span>인용 조문 없음 - 법령 데이터베이스에서 관련 조문을 찾지 못함</span>
                            </div>
                        </div>

                        {/* 오류 메시지 */}
                        <div className="flex flex-col items-center gap-4 max-w-md mx-auto text-center py-6">
                            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <Icon name="alert-triangle" size={28} className="text-amber-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-base font-medium text-foreground">검색 결과를 찾지 못했습니다</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    법령 데이터베이스에서 관련 조문을 찾을 수 없었습니다.
                                    다른 검색어로 다시 시도해 주세요.
                                </p>
                            </div>
                        </div>
                    </>
                )}

                {/* 답변 내용 렌더링 - 타이핑 효과 */}
                {displayedContent && !isStreaming && (
                    <div
                        style={{ fontSize: `${fontSize}px` }}
                        className="animate-in fade-in duration-200"
                    >
                        <LegalMarkdownRenderer
                            content={displayedContent}
                            onLawClick={onLawClick}
                            onAnnexClick={handleAnnexClick}
                        />
                        {/* 타이핑 중 커서 표시 */}
                        {isTyping && (
                            <span className="inline-block w-1 h-5 bg-primary animate-pulse ml-1" />
                        )}
                    </div>
                )}

                {/* AI 답변 주의사항 */}
                {displayedContent && !isTyping && !isStreaming && (
                    <div className="mt-6 flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/30 p-3 rounded-md text-amber-900 dark:text-amber-200/80 animate-in fade-in duration-500 delay-300">
                        <Icon name="alert-circle" size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-amber-900 dark:text-amber-200/80">이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다. 정확한 정보는 원문을 확인하거나 전문가와 상담하시기 바랍니다.</p>
                    </div>
                )}

                {/* 웹 검색 + 추가 질문 버튼 영역 */}
                {displayedContent && !isTyping && !isStreaming && userQuery && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2 animate-in fade-in duration-500 delay-500">
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground gap-2"
                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(userQuery)}`, '_blank')}
                        >
                            <Icon name="external-link" size={14} />
                            <span>"{userQuery.length > 25 ? userQuery.slice(0, 25) + '...' : userQuery}" 웹 검색</span>
                        </Button>
                        {onNewConversation && conversationHistory.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground gap-2"
                                onClick={onNewConversation}
                            >
                                <Icon name="plus" size={14} />
                                <span>새 대화</span>
                            </Button>
                        )}
                    </div>
                )}

                {/* 추가 질문 입력 */}
                {onFollowUp && displayedContent && !isTyping && !isStreaming && (
                    <div className="mt-5 animate-in fade-in duration-500 delay-700">
                        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                            <Icon name="arrow-right" size={16} className="text-muted-foreground/50 flex-shrink-0 ml-1" />
                            <input
                                type="text"
                                value={followUpInput}
                                onChange={(e) => setFollowUpInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && followUpInput.trim()) {
                                        onFollowUp(followUpInput.trim())
                                        setFollowUpInput('')
                                    }
                                }}
                                placeholder="추가 질문을 입력하세요..."
                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-primary hover:bg-primary/10 flex-shrink-0"
                                disabled={!followUpInput.trim()}
                                onClick={() => {
                                    if (followUpInput.trim()) {
                                        onFollowUp(followUpInput.trim())
                                        setFollowUpInput('')
                                    }
                                }}
                            >
                                <Icon name="send" size={14} />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground/40 mt-1 ml-1">이전 대화 맥락을 유지하며 추가 질문합니다</p>
                    </div>
                )}
            </div>

            {/* ✅ 별표 모달 */}
            <AnnexModal
                isOpen={annexModal.open}
                onClose={closeAnnexModal}
                annexNumber={annexModal.annexNumber}
                lawName={annexModal.lawName}
                onLawClick={(lawName, article) => {
                    // 별표 모달 내에서 법령 링크 클릭 시
                    closeAnnexModal()
                    if (article && onLawClick) {
                        onLawClick(lawName, article)
                    }
                }}
            />
        </div>
    )
}

/** 대화 히스토리 개별 엔트리 (더보기 토글) */
function HistoryEntry({ entry, fontSize, onLawClick }: {
    entry: ConversationEntry
    fontSize: number
    onLawClick?: (lawName: string, article?: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const isLong = entry.answer.length > 500

    return (
        <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
            {/* 이전 질문 */}
            <div className="flex items-start gap-2 px-3 py-2 bg-primary/5 border-b border-border/30">
                <Icon name="message-circle-question" size={14} className="text-primary/60 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-foreground/80 break-words">{entry.query}</span>
            </div>
            {/* 이전 답변 */}
            <div className="px-3 py-2 text-sm text-muted-foreground">
                <div className={expanded ? '' : 'line-clamp-3'} style={{ fontSize: `${Math.max(12, fontSize - 2)}px` }}>
                    <LegalMarkdownRenderer
                        content={expanded ? entry.answer : entry.answer.slice(0, 500)}
                        onLawClick={onLawClick}
                    />
                </div>
                {isLong && (
                    <button
                        type="button"
                        className="text-xs text-primary/60 hover:text-primary mt-1 block cursor-pointer"
                        onClick={() => setExpanded(v => !v)}
                    >
                        {expanded ? '접기' : '... 더 보기'}
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── 영향분석 스타일 단계 타임라인 ───

/** call/result 페어링 → 완료/진행 중 단계 목록 */
function buildSteps(logs: ToolCallLogEntry[]) {
    const steps: Array<{
        name: string
        displayName: string
        query?: string
        status: 'completed' | 'in-progress'
        durationMs?: number
        success?: boolean
        summary?: string
        statusMessages: string[]
    }> = []

    // status 메시지 수집 (call 직전/직후 status들)
    const statusBefore = new Map<number, string[]>()
    let pendingStatuses: string[] = []

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        if (log.type === 'status') {
            pendingStatuses.push(log.message || log.displayName)
        } else if (log.type === 'call') {
            statusBefore.set(i, [...pendingStatuses])
            pendingStatuses = []
        } else {
            pendingStatuses = []
        }
    }

    // call/result 페어링
    const calls = logs.map((l, i) => ({ ...l, _idx: i })).filter(l => l.type === 'call')
    const results = logs.filter(l => l.type === 'result')

    for (const call of calls) {
        const matchResult = results.find(r => r.name === call.name && r.timestamp && call.timestamp && r.timestamp >= call.timestamp)
        const msgs = statusBefore.get(call._idx) || []
        if (matchResult) {
            steps.push({
                name: call.name || '',
                displayName: call.displayName,
                query: call.query,
                status: 'completed',
                durationMs: (matchResult.timestamp! - call.timestamp!),
                success: matchResult.success,
                summary: matchResult.summary,
                statusMessages: msgs,
            })
        } else {
            steps.push({
                name: call.name || '',
                displayName: call.displayName,
                query: call.query,
                status: 'in-progress',
                statusMessages: msgs,
            })
        }
    }

    // call이 없는 경우 status만으로 단계 구성
    if (calls.length === 0 && logs.length > 0) {
        const statuses = logs.filter(l => l.type === 'status')
        for (let i = 0; i < statuses.length; i++) {
            const next = statuses[i + 1]
            const isLast = i === statuses.length - 1
            steps.push({
                name: `status-${i}`,
                displayName: statuses[i].message || statuses[i].displayName,
                status: isLast ? 'in-progress' : 'completed',
                durationMs: next?.timestamp && statuses[i].timestamp ? (next.timestamp - statuses[i].timestamp) : undefined,
                success: true,
                statusMessages: [],
            })
        }
    }

    // 마지막에 남은 status 메시지 (진행 중 단계 하위 표시용)
    const lastStatus = [...logs].reverse().find(l => l.type === 'status')
    return { steps, lastStatusMessage: lastStatus?.message || lastStatus?.displayName }
}

/** 실시간 경과 타이머 */
function AiStepTimer() {
    const [elapsed, setElapsed] = useState(0)
    const startRef = useRef(Date.now())

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed((Date.now() - startRef.current) / 1000)
        }, 100)
        return () => clearInterval(interval)
    }, [])

    return (
        <span className="text-xs text-brand-gold tabular-nums shrink-0">
            {elapsed.toFixed(1)}초
        </span>
    )
}

/** 영향분석 스타일 단계별 타임라인 */
function AiStepTimeline({ toolCallLogs, isStreaming }: { toolCallLogs: ToolCallLogEntry[], isStreaming: boolean }) {
    const { steps, lastStatusMessage } = useMemo(() => buildSteps(toolCallLogs), [toolCallLogs])

    return (
        <>
            {steps.map((step, i) => (
                <div key={`${step.name}-${i}`}>
                    <div className="flex items-center gap-2.5 text-sm">
                        {step.status === 'completed' ? (
                            <Icon name="check-circle" size={15} className="text-emerald-500 shrink-0" />
                        ) : (
                            <Icon name="loader" size={15} className="text-brand-gold animate-spin shrink-0" />
                        )}
                        <span className={`flex-1 truncate ${
                            step.status === 'completed'
                                ? 'text-gray-600 dark:text-gray-400'
                                : 'font-medium text-gray-800 dark:text-gray-200'
                        }`}>
                            {step.displayName}
                        </span>
                        {step.status === 'completed' && step.durationMs != null ? (
                            <span className="text-xs text-gray-400 tabular-nums shrink-0">
                                {(step.durationMs / 1000).toFixed(1)}초
                            </span>
                        ) : step.status === 'in-progress' && isStreaming ? (
                            <AiStepTimer />
                        ) : null}
                    </div>
                    {/* 진행 중 단계 하위 status 메시지 */}
                    {step.status === 'in-progress' && isStreaming && lastStatusMessage && (
                        <div className="ml-[27px] text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {lastStatusMessage}
                        </div>
                    )}
                </div>
            ))}
        </>
    )
}
