"use client"

import type React from "react"
import { useEffect, useMemo } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    FileText,
    Loader2,
    AlertCircle,
    ExternalLink,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Copy,
} from "lucide-react"
import type { LawArticle, LawMeta, DelegationItem } from "@/lib/law-types"
import { extractArticleText, formatDelegationContent } from "@/lib/law-xml-parser"
import { formatSimpleJo } from "@/lib/law-parser"
import { DelegationLoadingSkeleton } from "@/components/delegation-loading-skeleton"
import type { AdminRuleMatch } from "@/lib/use-admin-rules"
import { useToast } from "@/hooks/use-toast"

interface DelegationPanelProps {
    // Data
    activeArticle: LawArticle
    meta: LawMeta
    fontSize: number
    isOrdinance?: boolean

    // Three-Tier State
    validDelegations: DelegationItem[]
    isLoadingThreeTier: boolean
    delegationActiveTab: "decree" | "rule" | "admin"
    setDelegationActiveTab: (tab: "decree" | "rule" | "admin") => void
    delegationPanelSize: number
    setDelegationPanelSize: (size: number) => void

    // Admin Rules State
    showAdminRules: boolean
    setShowAdminRules: (show: boolean) => void
    loadingAdminRules: boolean
    loadedAdminRulesCount: number
    adminRules: AdminRuleMatch[]
    adminRuleViewMode: "list" | "detail"
    setAdminRuleViewMode: (mode: "list" | "detail") => void
    adminRuleHtml: string | null
    adminRuleTitle: string | null
    handleViewAdminRuleFullContent: (rule: AdminRuleMatch) => void

    // Font size controls
    increaseFontSize: () => void
    decreaseFontSize: () => void
    resetFontSize: () => void

    // Handlers
    handleContentClick: React.MouseEventHandler<HTMLDivElement>
}

export function DelegationPanel({
    activeArticle,
    meta,
    fontSize,
    isOrdinance = false,
    validDelegations,
    isLoadingThreeTier,
    delegationActiveTab,
    setDelegationActiveTab,
    delegationPanelSize,
    setDelegationPanelSize,
    showAdminRules,
    setShowAdminRules,
    loadingAdminRules,
    loadedAdminRulesCount,
    adminRules,
    adminRuleViewMode,
    setAdminRuleViewMode,
    adminRuleHtml,
    adminRuleTitle,
    handleViewAdminRuleFullContent,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    handleContentClick
}: DelegationPanelProps) {
    const { toast } = useToast()

    // ✅ useMemo로 HTML 생성 결과 캐싱 (중복 호출 방지)
    const articleHtml = useMemo(() => {
        return extractArticleText(activeArticle, false, meta.lawTitle)
    }, [activeArticle.jo, activeArticle.content, meta.lawTitle])

    // ✅ 시행령/시행규칙 HTML 캐싱 (중복 호출 방지)
    const delegationsHtmlCache = useMemo(() => {
        const cache = new Map<string, string>()
        validDelegations.forEach((delegation, idx) => {
            if (delegation.content) {
                const key = `${delegation.type}-${idx}`
                cache.set(key, formatDelegationContent(delegation.content))
            }
        })
        return cache
    }, [validDelegations])

    // 조문 또는 법률 변경 시 행정규칙 초기화
    useEffect(() => {
        // 행정규칙이 디테일 뷰인 경우 목록으로 리셋
        if (adminRuleViewMode === "detail") {
            setAdminRuleViewMode("list")
        }
        // 조문/법률이 변경되면 행정규칙은 자동으로 새로 로드됨 (use-law-viewer-admin-rules.ts의 useEffect)
    }, [activeArticle.jo, meta.lawTitle])

    return (
        <>
            {/* Mobile: Tab-based view */}
            <div className="md:hidden h-full flex flex-col">
                <Tabs
                    defaultValue="law"
                    className="flex-1 flex flex-col overflow-hidden"
                    onValueChange={(value) => {
                        // 행정규칙 탭 선택 시 로드 시작 (단계적 로딩)
                        if (value === "admin" && !showAdminRules) {
                            setShowAdminRules(true)
                        }
                    }}
                >
                    <div className="px-4 pt-2 pb-2 border-b border-border">
                        <TabsList className="w-full grid grid-cols-4 h-auto">
                            <TabsTrigger value="law" className="text-sm whitespace-nowrap h-9 px-2">법률</TabsTrigger>
                            <TabsTrigger value="decree" className="text-sm whitespace-nowrap h-9 px-1">
                                시행령 ({validDelegations.filter((d) => d.type === "시행령").length})
                            </TabsTrigger>
                            <TabsTrigger value="rule" className="text-sm whitespace-nowrap h-9 px-1">
                                시행규칙 ({validDelegations.filter((d) => d.type === "시행규칙").length})
                            </TabsTrigger>
                            <TabsTrigger value="admin" className="text-sm whitespace-nowrap h-9 px-1">
                                {loadingAdminRules ? (
                                    <>
                                        행정규칙 <Loader2 className="h-3 w-3 ml-1 inline-block animate-spin" />
                                    </>
                                ) : loadedAdminRulesCount > 0 ? (
                                    <>행정규칙 ({loadedAdminRulesCount})</>
                                ) : (
                                    "행정규칙"
                                )}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="law" className="flex-1 overflow-y-auto mt-0">
                        <div className="prose prose-sm max-w-none w-full dark:prose-invert p-4">
                            <div className="mb-3 pb-2 border-b border-border">
                                {/* 조문 제목 (1줄로 표시) */}
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText className="h-4 w-4 text-foreground shrink-0" />
                                    <h3 className="text-base font-bold text-foreground truncate flex-1 min-w-0">
                                        {formatSimpleJo(activeArticle.jo, isOrdinance)}
                                        {activeArticle.title && <span className="text-muted-foreground font-normal ml-1">({activeArticle.title})</span>}
                                    </h3>
                                    <Badge variant="secondary" className="text-xs shrink-0">법률 본문</Badge>
                                </div>
                            </div>
                            <div
                                className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                style={{
                                    fontSize: `${fontSize}px`,
                                    lineHeight: "1.8",
                                    overflowWrap: "break-word",
                                    wordBreak: "break-word",
                                }}
                                onClick={handleContentClick}
                                dangerouslySetInnerHTML={{ __html: articleHtml }}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="decree" className="flex-1 overflow-y-auto mt-0">
                        {isLoadingThreeTier ? (
                            <DelegationLoadingSkeleton />
                        ) : (
                            <div className="p-4">
                                <div className="mb-3 pb-2 border-b border-border flex items-center justify-between gap-2">
                                    <h3 className="text-base font-bold text-foreground leading-tight flex-1 min-w-0 flex items-center gap-1">
                                        <FileText className="h-4 w-4 text-foreground shrink-0" />
                                        <span>시행령</span>
                                        <Badge variant="secondary" className="text-xs ml-1 shrink-0">
                                            {validDelegations.filter((d) => d.type === "시행령").length}개
                                        </Badge>
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {validDelegations
                                        .filter((d) => d.type === "시행령")
                                        .map((delegation, idx) => {
                                            const originalIdx = validDelegations.findIndex(d => d === delegation)
                                            return (
                                                <div key={idx} className="p-3 rounded-lg border border-border">
                                                    {delegation.title && (
                                                        <p className="font-semibold text-sm text-foreground mb-2">
                                                            {delegation.title}
                                                        </p>
                                                    )}
                                                    {delegation.content && (
                                                        <div
                                                            className="text-xs text-foreground leading-relaxed break-words"
                                                            style={{
                                                                fontSize: `${fontSize}px`,
                                                                lineHeight: "1.8",
                                                                overflowWrap: "break-word",
                                                                wordBreak: "break-word",
                                                            }}
                                                            onClick={handleContentClick}
                                                            dangerouslySetInnerHTML={{ __html: delegationsHtmlCache.get(`${delegation.type}-${originalIdx}`) || '' }}
                                                        />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    {validDelegations.filter((d) => d.type === "시행령").length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">시행령 없음</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="rule" className="flex-1 overflow-y-auto mt-0">
                        {isLoadingThreeTier ? (
                            <DelegationLoadingSkeleton />
                        ) : (
                            <div className="p-4">
                                <div className="mb-3 pb-2 border-b border-border flex items-center justify-between gap-2">
                                    <h3 className="text-base font-bold text-foreground leading-tight flex-1 min-w-0 flex items-center gap-1">
                                        <FileText className="h-4 w-4 text-foreground shrink-0" />
                                        <span>시행규칙</span>
                                        <Badge variant="secondary" className="text-xs ml-1 shrink-0">
                                            {validDelegations.filter((d) => d.type === "시행규칙" || d.type === "행정규칙").length}개
                                        </Badge>
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {validDelegations
                                        .filter((d) => d.type === "시행규칙" || d.type === "행정규칙")
                                        .map((delegation, idx) => {
                                            const originalIdx = validDelegations.findIndex(d => d === delegation)
                                            return (
                                                <div
                                                    key={idx}
                                                    className="p-3 rounded-lg border border-border"
                                                >
                                                    {delegation.title && (
                                                        <p className="font-semibold text-sm text-foreground mb-2">
                                                            {delegation.title}
                                                        </p>
                                                    )}
                                                    {delegation.content && (
                                                        <div
                                                            className="text-xs text-foreground leading-relaxed break-words"
                                                            style={{
                                                                fontSize: `${fontSize}px`,
                                                                lineHeight: "1.8",
                                                                overflowWrap: "break-word",
                                                                wordBreak: "break-word",
                                                            }}
                                                            onClick={handleContentClick}
                                                            dangerouslySetInnerHTML={{ __html: delegationsHtmlCache.get(`${delegation.type}-${originalIdx}`) || '' }}
                                                        />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    {validDelegations.filter((d) => d.type === "시행규칙").length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="admin" className="flex-1 overflow-y-auto mt-0">
                        {!showAdminRules ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FileText className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                                <p className="text-xs mt-2 text-muted-foreground/70">
                                    클릭 시 자동으로 로드됩니다
                                </p>
                            </div>
                        ) : loadingAdminRules ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="h-12 w-12 mb-4 animate-spin text-primary" />
                                <p className="text-sm font-medium">행정규칙 검색 중...</p>
                                <p className="text-xs mt-2 text-muted-foreground/70">
                                    관련 행정규칙을 찾고 있습니다
                                </p>
                            </div>
                        ) : adminRuleViewMode === "detail" && adminRuleHtml ? (
                            <div className="p-4">
                                <div className="mb-3 pb-2 border-b border-border flex items-center justify-between gap-2">
                                    <h3 className="text-base font-bold text-foreground leading-tight flex-1 min-w-0 flex items-center gap-1">
                                        <FileText className="h-4 w-4 text-foreground shrink-0" />
                                        <span className="truncate">{adminRuleTitle || "행정규칙"}</span>
                                    </h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAdminRuleViewMode("list")}
                                        className="h-7 shrink-0"
                                    >
                                        ← 목록
                                    </Button>
                                </div>
                                <div
                                    className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                    style={{
                                        fontSize: `${fontSize}px`,
                                        lineHeight: "1.8",
                                        overflowWrap: "break-word",
                                        wordBreak: "break-word",
                                    }}
                                    onClick={handleContentClick}
                                    dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                                />
                            </div>
                        ) : adminRules.length > 0 ? (
                            <div className="p-4">
                                <div className="mb-3 pb-2 border-b border-border flex items-center justify-between gap-2">
                                    <h3 className="text-base font-bold text-foreground leading-tight flex-1 min-w-0 flex items-center gap-1">
                                        <FileText className="h-4 w-4 text-foreground shrink-0" />
                                        <span>행정규칙</span>
                                        <Badge variant="secondary" className="text-xs ml-1 shrink-0">
                                            {adminRules.length}개
                                        </Badge>
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {adminRules.map((rule, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                console.log('[Mobile] Button clicked:', rule.name, 'ID:', rule.serialNumber || rule.id)
                                                handleViewAdminRuleFullContent(rule)
                                            }}
                                            type="button"
                                            className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1">
                                                    <p className="font-semibold text-sm text-foreground mb-1">
                                                        {rule.name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        관련 조문: {formatSimpleJo(activeArticle.jo, isOrdinance)}
                                                    </p>
                                                </div>
                                                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">이 조문과 관련된 행정규칙이 없습니다</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Desktop: 2-column resizable view with tabs */}
            <div className="hidden md:block h-full">
                <PanelGroup direction="horizontal" className="h-full">
                    {/* Left Panel: Main article - 항상 전체 높이 유지 */}
                    <Panel
                        defaultSize={delegationPanelSize}
                        minSize={20}
                        maxSize={70}
                        onResize={(size) => {
                            setDelegationPanelSize(size)
                            if (typeof window !== 'undefined') {
                                localStorage.setItem('lawViewerDelegationSplit', size.toString())
                            }
                        }}
                        className="flex flex-col"
                    >
                        <ScrollArea className="h-full">
                            <div style={{ paddingLeft: '1.5rem', paddingRight: '0.5rem', paddingBottom: '1rem' }}>
                                <div className="prose prose-sm max-w-none dark:prose-invert">
                                    <div className="mb-4 pb-2 border-b border-border">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-foreground" />
                                            <h3 className="text-base font-bold text-foreground">
                                                {formatSimpleJo(activeArticle.jo, isOrdinance)}
                                                {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                                            </h3>
                                            <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                                        </div>
                                    </div>
                                    <div
                                        className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                        style={{
                                            fontSize: `${fontSize}px`,
                                            lineHeight: "1.8",
                                            overflowWrap: "break-word",
                                            wordBreak: "break-word",
                                        }}
                                        onClick={handleContentClick}
                                        dangerouslySetInnerHTML={{ __html: articleHtml }}
                                    />
                                </div>
                            </div>
                        </ScrollArea>
                    </Panel>

                    {/* Resize Handle */}
                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors cursor-col-resize" />

                    {/* Right Panel: Tabs for 시행령/시행규칙/행정규칙 - 항상 전체 높이 유지 */}
                    <Panel className="flex flex-col">
                        <ScrollArea className="h-full">
                            <div style={{ paddingLeft: '1rem', paddingRight: '0.5rem', paddingBottom: '1rem' }}>
                                <Tabs
                                    value={delegationActiveTab}
                                    onValueChange={(value) => {
                                        setDelegationActiveTab(value as "decree" | "rule" | "admin")
                                        if (value === "admin" && !showAdminRules) {
                                            setShowAdminRules(true)
                                        }
                                    }}
                                    className="w-full flex flex-col"
                                >
                                    <TabsList className="w-full grid grid-cols-3 mb-2">
                                        <TabsTrigger value="decree" className="text-sm">
                                            시행령 ({validDelegations.filter((d) => d.type === "시행령").length})
                                        </TabsTrigger>
                                        <TabsTrigger value="rule" className="text-sm">
                                            시행규칙 ({validDelegations.filter((d) => d.type === "시행규칙").length})
                                        </TabsTrigger>
                                        <TabsTrigger value="admin" className="text-sm">
                                            {loadingAdminRules ? (
                                                <>
                                                    행정규칙 <Loader2 className="h-3 w-3 ml-1 inline-block animate-spin" />
                                                </>
                                            ) : loadedAdminRulesCount > 0 ? (
                                                `행정규칙 (${loadedAdminRulesCount})`
                                            ) : (
                                                "행정규칙"
                                            )}
                                        </TabsTrigger>
                                    </TabsList>

                                    {/* Decree Tab */}
                                    <TabsContent value="decree" className="mt-0">
                                        {isLoadingThreeTier ? (
                                            <DelegationLoadingSkeleton />
                                        ) : (
                                            <>
                                                <div className="mb-2 pb-2 border-b border-border flex-shrink-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="h-4 w-4 text-foreground" />
                                                            <h3 className="text-base font-bold text-foreground">시행령</h3>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {validDelegations.filter((d) => d.type === "시행령").length}개
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                                                                <ZoomOut className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                                                                <RotateCcw className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                                                                <ZoomIn className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <span className="text-xs text-muted-foreground ml-1 mr-2">{fontSize}px</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const content = validDelegations
                                                                        .filter((d) => d.type === "시행령")
                                                                        .map((d) => `${d.title || ''}\n\n${d.content || ''}`)
                                                                        .join('\n\n---\n\n')
                                                                    navigator.clipboard.writeText(content)
                                                                    toast({ title: "복사 완료", description: "시행령 내용이 클립보드에 복사되었습니다." })
                                                                }}
                                                                title="복사"
                                                                className="h-7 px-2"
                                                            >
                                                                <Copy className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <ScrollArea className="h-[calc(100vh-12rem)]">
                                                    <div className="space-y-3 pr-4">
                                                        {validDelegations
                                                            .filter((d) => d.type === "시행령")
                                                            .map((delegation, idx) => {
                                                                const originalIdx = validDelegations.findIndex(d => d === delegation)
                                                                return (
                                                                    <div key={idx} className="py-3 border-b border-border last:border-0">
                                                                        {delegation.title && (
                                                                            <p className="font-semibold text-sm text-foreground mb-2">
                                                                                {delegation.title}
                                                                            </p>
                                                                        )}
                                                                        {delegation.content && (
                                                                            <div
                                                                                className="text-xs text-foreground leading-relaxed break-words"
                                                                                style={{
                                                                                    fontSize: `${fontSize}px`,
                                                                                    lineHeight: "1.8",
                                                                                    overflowWrap: "break-word",
                                                                                    wordBreak: "break-word",
                                                                                }}
                                                                                onClick={handleContentClick}
                                                                                dangerouslySetInnerHTML={{ __html: delegationsHtmlCache.get(`${delegation.type}-${originalIdx}`) || '' }}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        {validDelegations.filter((d) => d.type === "시행령").length === 0 && (
                                                            <p className="text-xs text-muted-foreground text-center py-4">시행령 없음</p>
                                                        )}
                                                    </div>
                                                </ScrollArea>
                                            </>
                                        )}
                                    </TabsContent>

                                    {/* Rule Tab */}
                                    <TabsContent value="rule" className="mt-0">
                                        {isLoadingThreeTier ? (
                                            <DelegationLoadingSkeleton />
                                        ) : (
                                            <>
                                                <div className="mb-2 pb-2 border-b border-border flex-shrink-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="h-4 w-4 text-foreground" />
                                                            <h3 className="text-base font-bold text-foreground">시행규칙</h3>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {validDelegations.filter((d) => d.type === "시행규칙").length}개
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                                                                <ZoomOut className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                                                                <RotateCcw className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                                                                <ZoomIn className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <span className="text-xs text-muted-foreground ml-1 mr-2">{fontSize}px</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const content = validDelegations
                                                                        .filter((d) => d.type === "시행규칙")
                                                                        .map((d) => `${d.title || ''}\n\n${d.content || ''}`)
                                                                        .join('\n\n---\n\n')
                                                                    navigator.clipboard.writeText(content)
                                                                    toast({ title: "복사 완료", description: "시행규칙 내용이 클립보드에 복사되었습니다." })
                                                                }}
                                                                title="복사"
                                                                className="h-7 px-2"
                                                            >
                                                                <Copy className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <ScrollArea className="h-[calc(100vh-12rem)]">
                                                    <div className="space-y-3 pr-4">
                                                        {validDelegations
                                                            .filter((d) => d.type === "시행규칙")
                                                            .map((delegation, idx) => {
                                                                const originalIdx = validDelegations.findIndex(d => d === delegation)
                                                                return (
                                                                    <div key={idx} className="py-3 border-b border-border last:border-0">
                                                                        {delegation.title && (
                                                                            <p className="font-semibold text-sm text-foreground mb-2">
                                                                                {delegation.title}
                                                                            </p>
                                                                        )}
                                                                        {delegation.content && (
                                                                            <div
                                                                                className="text-xs text-foreground leading-relaxed break-words"
                                                                                style={{
                                                                                    fontSize: `${fontSize}px`,
                                                                                    lineHeight: "1.8",
                                                                                    overflowWrap: "break-word",
                                                                                    wordBreak: "break-word",
                                                                                }}
                                                                                onClick={handleContentClick}
                                                                                dangerouslySetInnerHTML={{ __html: delegationsHtmlCache.get(`${delegation.type}-${originalIdx}`) || '' }}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        {validDelegations.filter((d) => d.type === "시행규칙").length === 0 && (
                                                            <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                                                        )}
                                                    </div>
                                                </ScrollArea>
                                            </>
                                        )}
                                    </TabsContent>

                                    {/* Admin Rules Tab */}
                                    <TabsContent value="admin" className="mt-0">
                                        {!showAdminRules ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                                <FileText className="h-12 w-12 mb-4 opacity-30" />
                                                <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                                                <p className="text-xs mt-2 text-muted-foreground/70">
                                                    클릭 시 자동으로 로드됩니다
                                                </p>
                                            </div>
                                        ) : loadingAdminRules ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                                <Loader2 className="h-12 w-12 mb-4 animate-spin text-primary" />
                                                <p className="text-sm font-medium">행정규칙 검색 중...</p>
                                                <p className="text-xs mt-2 text-muted-foreground/70">
                                                    관련 행정규칙을 찾고 있습니다
                                                </p>
                                            </div>
                                        ) : adminRuleViewMode === "detail" && adminRuleHtml ? (
                                            <>
                                                <div className="mb-2 pb-2 border-b border-border flex-shrink-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="h-4 w-4 text-foreground" />
                                                            <h3 className="text-base font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setAdminRuleViewMode("list")}
                                                                className="h-7 px-2 mr-2"
                                                            >
                                                                ← 목록
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                                                                <ZoomOut className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                                                                <RotateCcw className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                                                                <ZoomIn className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <span className="text-xs text-muted-foreground ml-1 mr-2">{fontSize}px</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const content = `${adminRuleTitle || '행정규칙'}\n\n${adminRuleHtml?.replace(/<[^>]*>/g, '') || ''}`
                                                                    navigator.clipboard.writeText(content)
                                                                    toast({ title: "복사 완료", description: "행정규칙 내용이 클립보드에 복사되었습니다." })
                                                                }}
                                                                title="복사"
                                                                className="h-7 px-2"
                                                            >
                                                                <Copy className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <ScrollArea className="h-[calc(100vh-12rem)]">
                                                    <div
                                                        className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm pr-4"
                                                        style={{
                                                            fontSize: `${fontSize}px`,
                                                            lineHeight: "1.8",
                                                            overflowWrap: "break-word",
                                                            wordBreak: "break-word",
                                                        }}
                                                        onClick={handleContentClick}
                                                        dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                                                    />
                                                </ScrollArea>
                                            </>
                                        ) : adminRules.length > 0 ? (
                                            <>
                                                <div className="mb-2 pb-2 border-b border-border flex-shrink-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="h-4 w-4 text-foreground" />
                                                            <h3 className="text-base font-bold text-foreground">행정규칙</h3>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {adminRules.length}개
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                                                                <ZoomOut className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                                                                <RotateCcw className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                                                                <ZoomIn className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <span className="text-xs text-muted-foreground ml-1 mr-2">{fontSize}px</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <ScrollArea className="h-[calc(100vh-12rem)]">
                                                    <div className="space-y-3 pr-4">
                                                        {adminRules.map((rule, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => {
                                                                    console.log('[Desktop] Button clicked:', rule.name, 'ID:', rule.serialNumber || rule.id)
                                                                    handleViewAdminRuleFullContent(rule)
                                                                }}
                                                                type="button"
                                                                className="w-full text-left py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors rounded px-2"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1">
                                                                        <p className="font-semibold text-sm text-foreground mb-1">
                                                                            {rule.name}
                                                                        </p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            관련: {formatSimpleJo(activeArticle.jo, isOrdinance)}
                                                                        </p>
                                                                    </div>
                                                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                                <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
                                                <p className="text-sm">이 조문과 관련된 행정규칙이 없습니다</p>
                                            </div>
                                        )}
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </ScrollArea>
                    </Panel>
                </PanelGroup>
            </div>
        </>
    )
}
