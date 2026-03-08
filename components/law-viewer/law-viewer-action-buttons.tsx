"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { CopyButton } from "@/components/ui/copy-button"
import { cn } from "@/lib/utils"
import type { LawArticle } from "@/lib/law-types"
import type { PrecedentSearchResult } from "@/lib/precedent-parser"

interface LawViewerActionButtonsProps {
  // 타입 판별
  isPrecedent: boolean
  isOrdinance: boolean
  aiAnswerMode: boolean

  // 데이터
  activeArticle: LawArticle | null
  actualArticles: LawArticle[]

  // 판례 관련 심급
  hasLevelSection: boolean
  showRelatedCases: boolean
  setShowRelatedCases: (v: boolean) => void
  loadingRelatedCases: boolean
  relatedCases: PrecedentSearchResult[]

  // 즐겨찾기
  favorites: Set<string>
  isFavorite: (jo: string) => boolean
  favoriteKey: (jo: string) => string
  onToggleFavorite?: (jo: string) => void

  // 글자크기
  fontSize: number
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void

  // 콜백
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void
  onRefresh?: () => void
  openLawCenter: () => void

  // 위임법령
  tierViewMode: "1-tier" | "2-tier" | "3-tier"
  setTierViewMode: (mode: "1-tier" | "2-tier" | "3-tier") => void
  threeTierDelegation: any
  threeTierCitation: any
  isLoadingThreeTier: boolean
  fetchThreeTierData: () => Promise<void>
  shouldDisableDelegationButton: boolean
  delegationButtonCount: number
  delegationActiveTab: string
  loadedAdminRulesCount: number
  setShowAdminRules: (v: boolean) => void

  // 판례
  showPrecedents: boolean
  setShowPrecedents: (v: boolean) => void
  precedentTotalCount: number
}

export function LawViewerActionButtons({
  isPrecedent,
  isOrdinance,
  aiAnswerMode,
  activeArticle,
  actualArticles,
  hasLevelSection,
  showRelatedCases,
  setShowRelatedCases,
  loadingRelatedCases,
  relatedCases,
  favorites,
  isFavorite,
  favoriteKey,
  onToggleFavorite,
  fontSize,
  increaseFontSize,
  decreaseFontSize,
  resetFontSize,
  onCompare,
  onSummarize,
  onRefresh,
  openLawCenter,
  tierViewMode,
  setTierViewMode,
  threeTierDelegation,
  threeTierCitation,
  isLoadingThreeTier,
  fetchThreeTierData,
  shouldDisableDelegationButton,
  delegationButtonCount,
  delegationActiveTab,
  loadedAdminRulesCount,
  setShowAdminRules,
  showPrecedents,
  setShowPrecedents,
  precedentTotalCount,
}: LawViewerActionButtonsProps) {
  // AI 답변 모드이거나 activeArticle이 없으면 렌더링하지 않음
  if (aiAnswerMode || (!activeArticle && !isPrecedent)) {
    return null
  }

  const hasRelatedCases = relatedCases.length > 0
  const activeBtnCls = "bg-[#1a2b4c] border-[#1a2b4c] text-white hover:bg-[#0f192e] hover:text-white dark:bg-[#1a2b4c] dark:border-[#1a2b4c] dark:text-[#e2a85d] dark:hover:bg-[#0f192e] dark:hover:text-[#e2a85d]"

  return (
    <div className="border-b border-border px-3 sm:px-4 pt-1.5 sm:pt-3 pb-1.5 sm:pb-3">
      <div className="flex flex-nowrap gap-1 sm:gap-1.5 overflow-x-auto">
        {isPrecedent ? (
          // 판례 전용 액션 버튼
          <div className="flex items-center justify-between w-full">
            <div className="flex flex-nowrap gap-1 sm:gap-1.5">
              <Button variant="outline" size="sm" onClick={openLawCenter} className="h-7 px-1.5 sm:px-2 shrink-0">
                <Icon name="external-link" size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">원문 보기</span>
                <span className="sm:hidden">원문</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle?.jo || '')} className="h-7 px-1.5 sm:px-2 shrink-0">
                <Icon name="sparkles" size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">판례 요약</span>
                <span className="sm:hidden">요약</span>
              </Button>
              {/* 【심급】 섹션이 있는 판례만 관련 심급 버튼 표시 */}
              {hasLevelSection && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRelatedCases(!showRelatedCases)}
                  className={`h-7 px-1.5 sm:px-2 shrink-0 ${showRelatedCases ? activeBtnCls : ''}`}
                >
                  <Icon name="git-compare" size={14} className="sm:mr-1" />
                  <span className="hidden sm:inline">관련 심급</span>
                  <span className="sm:hidden">심급</span>
                  {loadingRelatedCases ? (
                    <Icon name="loader" size={12} className="ml-1 animate-spin" />
                  ) : hasRelatedCases ? (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                      {relatedCases.length}
                    </Badge>
                  ) : null}
                </Button>
              )}
              {activeArticle && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleFavorite?.(activeArticle.jo)}
                  className={`h-7 px-1.5 sm:px-2 shrink-0 ${favorites.has(favoriteKey(activeArticle.jo)) ? activeBtnCls : ''}`}
                >
                  <Icon
                    name="star"
                    size={14}
                    className={`sm:mr-1 ${favorites.has(favoriteKey(activeArticle.jo)) ? "fill-yellow-400 text-yellow-500" : ""}`}
                  />
                  <span className="hidden sm:inline">즐겨찾기</span>
                  <span className="sm:hidden">★</span>
                </Button>
              )}
            </div>
            {/* 우측: 새로고침 + 글자크기 + 복사 */}
            <div className="flex items-center gap-0.5">
              {/* 강제 새로고침 버튼 */}
              {onRefresh && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
                  <Icon name="refresh-cw" size={14} />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                <Icon name="zoom-out" size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                <Icon name="rotate-clockwise" size={12} />
              </Button>
              <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                <Icon name="zoom-in" size={14} />
              </Button>
              <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
              <CopyButton
                getText={() => actualArticles.map(a => `【${a.joNum || a.title}】\n${a.content}`).join('\n\n')}
                message="판례 복사됨"
                className="h-7 w-7 p-0"
              />
            </div>
          </div>
        ) : !isOrdinance && activeArticle ? (
          // 법령 전용 액션 버튼
          <>
            <Button variant="outline" size="sm" onClick={() => onCompare?.(activeArticle.jo)} className={`h-7 px-1.5 sm:px-2 shrink-0 ${activeBtnCls}`}>
              <Icon name="git-compare" size={14} className="sm:mr-1" />
              <span className="hidden sm:inline">신·구법 비교</span>
              <span className="sm:hidden">비교</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle.jo)} className="h-7 px-1.5 sm:px-2 shrink-0">
              <Icon name="sparkles" size={14} className="sm:mr-1" />
              <span className="hidden sm:inline">AI 요약</span>
              <span className="sm:hidden">요약</span>
            </Button>
            <Button variant="outline" size="sm" onClick={openLawCenter} className="h-7 px-1.5 sm:px-2 shrink-0">
              <Icon name="external-link" size={14} className="sm:mr-1" />
              <span className="hidden sm:inline">원문 보기</span>
              <span className="sm:hidden">원문</span>
            </Button>
            {/* 위임법령 보기 버튼 (2단 뷰 + 탭 구조) */}
            <Button
              variant="outline"
              size="sm"
              disabled={isLoadingThreeTier || (tierViewMode === "1-tier" && shouldDisableDelegationButton)}
              onClick={async () => {
                if (tierViewMode === "1-tier") {
                  // 2단 뷰로 전환 (데이터 없으면 먼저 로드)
                  if (!threeTierDelegation && !threeTierCitation) await fetchThreeTierData()
                  setTierViewMode("2-tier")
                  // 행정규칙 탭이 선택되어 있고 데이터가 로드된 적 있으면 자동으로 활성화
                  if (delegationActiveTab === "admin" && loadedAdminRulesCount > 0) {
                    setShowAdminRules(true)
                  }
                } else {
                  // 1단 뷰로 복귀 (showAdminRules는 유지 - 패널 재오픈 시 복원용)
                  setTierViewMode("1-tier")
                }
              }}
              title="위임법령 보기 (시행령/시행규칙/행정규칙)"
              className={`h-7 px-1.5 sm:px-2 shrink-0 ${tierViewMode === "2-tier" ? activeBtnCls : ''}`}
            >
              {isLoadingThreeTier ? (
                <Icon name="loader" size={14} className="sm:mr-1 animate-spin" />
              ) : (
                <Icon name="file-text" size={14} className="sm:mr-1" />
              )}
              <span className="hidden sm:inline">{tierViewMode === "2-tier" ? "위임법령 닫기" : `위임법령${delegationButtonCount > 0 ? ` (${delegationButtonCount})` : ""}`}</span>
              <span className="sm:hidden">{tierViewMode === "2-tier" ? "닫기" : `위임${delegationButtonCount > 0 ? `(${delegationButtonCount})` : ""}`}</span>
            </Button>
            {/* 판례 보기 버튼 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPrecedents(!showPrecedents)}
              title="관련 판례 보기"
              className={`h-7 px-1.5 sm:px-2 shrink-0 ${showPrecedents ? activeBtnCls : ''}`}
            >
              <Icon name="scale" size={14} className="sm:mr-1" />
              <span className="hidden sm:inline">{showPrecedents ? "판례 닫기" : `판례${precedentTotalCount > 0 ? ` (${precedentTotalCount})` : ""}`}</span>
              <span className="sm:hidden">{showPrecedents ? "닫기" : `판례${precedentTotalCount > 0 ? `(${precedentTotalCount})` : ""}`}</span>
            </Button>
            {/* 즐겨찾기 - PC에서만 표시 (모바일은 제목줄에 있음) */}
            <Button
              key={`fav-btn-${activeArticle.jo}-${isFavorite(activeArticle.jo)}`}
              variant="outline"
              size="sm"
              onClick={() => onToggleFavorite?.(activeArticle.jo)}
              data-favorited={isFavorite(activeArticle.jo)}
              className={`hidden lg:flex h-7 px-2 transition-all ${isFavorite(activeArticle.jo) ? activeBtnCls : ''}`}
            >
              <Icon name="star" size={14} className={`mr-1 transition-all ${isFavorite(activeArticle.jo) ? "fill-yellow-300 text-yellow-300" : ""}`} />
              즐겨찾기
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
