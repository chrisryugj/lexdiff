"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/hooks/use-toast"
import { formatSimpleJo } from "@/lib/law-parser"
import type { AdminRulesTabProps } from "./types"

export function AdminRulesTab({
    showAdminRules,
    loadingAdminRules,
    hasEverLoaded,
    adminRules,
    adminRulesProgress,
    adminRuleViewMode,
    setAdminRuleViewMode,
    adminRuleHtml,
    adminRuleTitle,
    handleViewAdminRuleFullContent,
    fontSize,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    handleContentClick,
    activeArticleJo,
    isOrdinance = false
}: AdminRulesTabProps) {
    const { toast } = useToast()

    // Not loaded yet
    if (!showAdminRules) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Icon name="file-text" size={48} className="mb-4 opacity-30" />
                <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                <p className="text-xs mt-2 text-muted-foreground/70">
                    클릭 시 자동으로 로드됩니다
                </p>
            </div>
        )
    }

    // Loading — Tier 1 결과가 있으면 즉시 표시 (아래 list view에서 처리)
    // 결과가 전혀 없을 때만 로딩 스피너 표시
    if ((loadingAdminRules || !hasEverLoaded) && adminRules.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Icon name="loader" size={48} className="mb-4 animate-spin text-primary" />
                <p className="text-sm font-medium">행정규칙 검색 중...</p>
                <p className="text-xs mt-2 text-muted-foreground/70">
                    관련 행정규칙을 찾고 있습니다
                </p>
            </div>
        )
    }

    // Detail view
    if (adminRuleViewMode === "detail" && adminRuleHtml) {
        return (
            <>
                <div className="mb-2 pb-2 border-b border-border flex-shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Icon name="file-text" size={16} className="text-foreground" />
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
                                <Icon name="zoom-out" size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                                <Icon name="rotate-clockwise" size={12} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                                <Icon name="zoom-in" size={14} />
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
                                <Icon name="copy" size={14} />
                            </Button>
                        </div>
                    </div>
                </div>
                <ScrollArea className="h-[calc(100vh-12rem)]">
                    <div
                        className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm pr-4 font-maruburi"
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
        )
    }

    // List view with rules
    if (adminRules.length > 0) {
        return (
            <>
                <div className="mb-2 pb-2 border-b border-border flex-shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Icon name="file-text" size={16} className="text-foreground" />
                            <h3 className="text-base font-bold text-foreground">행정규칙</h3>
                            <Badge variant="secondary" className="text-xs">
                                {adminRules.length}개
                            </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                                <Icon name="zoom-out" size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                                <Icon name="rotate-clockwise" size={12} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                                <Icon name="zoom-in" size={14} />
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
                                    console.log('[AdminRulesTab] Button clicked:', rule.name, 'ID:', rule.serialNumber || rule.id)
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
                                            관련: {formatSimpleJo(activeArticleJo, isOrdinance)}
                                        </p>
                                    </div>
                                    <Icon name="external-link" size={14} className="text-muted-foreground shrink-0 mt-1" />
                                </div>
                            </button>
                        ))}
                        {/* Tier 2 검색 진행 중 인디케이터 */}
                        {loadingAdminRules && (
                            <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
                                <Icon name="loader" size={14} className="animate-spin" />
                                <span className="text-xs">추가 검색 중...</span>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </>
        )
    }

    // Empty state
    return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Icon name="file" size={48} className="mb-4 opacity-30" />
            <p className="text-sm">관련 행정규칙이 없습니다</p>
        </div>
    )
}
