"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { CopyButton } from "@/components/ui/copy-button"
import { RevisionHistory } from "@/components/revision-history"
import { PrecedentSection } from "@/components/precedent-section"
import type { LawArticle, LawMeta } from "@/lib/law-types"

interface LawViewerSingleArticleProps {
  // 데이터
  activeArticle: LawArticle
  activeArticleHtml: string
  meta: LawMeta
  revisionHistory: any[]

  // 설정
  fontSize: number
  isOrdinance: boolean

  // 콜백
  onRefresh?: () => void
  onToggleFavorite?: (jo: string) => void
  isFavorite: (jo: string) => boolean
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void
  handleContentClick: React.MouseEventHandler<HTMLDivElement>
  formatSimpleJo: (jo: string, forceOrdinance?: boolean) => string

  // 판례 관련 (optional)
  showPrecedents?: boolean
  precedentViewMode?: "bottom" | "side"
  precedents?: any[]
  precedentTotalCount?: number
  loadingPrecedents?: boolean
  precedentsError?: string | null
  selectedPrecedent?: any
  loadingPrecedentDetail?: boolean
  handleViewPrecedentDetail?: (prec: any) => void
  expandPrecedentPanel?: () => void
  collapsePrecedentPanel?: () => void
}

export function LawViewerSingleArticle({
  activeArticle,
  activeArticleHtml,
  meta,
  revisionHistory,
  fontSize,
  isOrdinance,
  onRefresh,
  onToggleFavorite,
  isFavorite,
  increaseFontSize,
  decreaseFontSize,
  resetFontSize,
  handleContentClick,
  formatSimpleJo,
  showPrecedents = false,
  precedentViewMode = "bottom",
  precedents = [],
  precedentTotalCount = 0,
  loadingPrecedents = false,
  precedentsError = null,
  selectedPrecedent,
  loadingPrecedentDetail = false,
  handleViewPrecedentDetail,
  expandPrecedentPanel,
  collapsePrecedentPanel,
}: LawViewerSingleArticleProps) {
  return (
    <div className="px-3 sm:px-4 lg:px-6 pt-2 sm:pt-3 pb-3">
      {/* 헤더: 제목 + 배지 + 버튼들 */}
      <div className="mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b border-border">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          {/* 제목 + 배지 */}
          <div className="flex items-center gap-1 lg:gap-2 min-w-0 sm:flex-1">
            <h2 className="text-lg lg:text-xl font-bold text-foreground break-words sm:truncate font-maruburi">
              {formatSimpleJo(activeArticle.jo, isOrdinance)}
              {activeArticle.title && (
                <span className="text-muted-foreground text-base lg:text-lg ml-1 lg:ml-2 font-pretendard">({activeArticle.title})</span>
              )}
            </h2>
            {meta.lawTitle === "대한민국헌법" ? (
              <Badge variant="outline" className="text-xs shrink-0 bg-amber-500/20 text-amber-300 border-amber-500/50 hidden sm:flex">
                <Icon name="landmark" size={12} className="mr-1" />
                헌법
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs shrink-0 hidden sm:flex">
                {isOrdinance ? "자치법규" : "법률"}
              </Badge>
            )}
          </div>

          {/* 버튼 그룹 */}
          <div className="flex items-center gap-0 shrink-0">
            {onRefresh && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={onRefresh} title="최신 정보로 새로고침">
                <Icon name="refresh-cw" size={14} />
              </Button>
            )}
            <Button
              key={`fav-btn-title-${activeArticle.jo}-${isFavorite(activeArticle.jo)}`}
              variant="ghost"
              size="sm"
              onClick={() => onToggleFavorite?.(activeArticle.jo)}
              className="h-7 w-7 p-0"
              title={isFavorite(activeArticle.jo) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            >
              <Icon name="star" size={16} className={`transition-all ${isFavorite(activeArticle.jo) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 w-7 p-0">
              <Icon name="zoom-out" size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 w-7 p-0">
              <Icon name="rotate-clockwise" size={12} />
            </Button>
            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 w-7 p-0">
              <Icon name="zoom-in" size={14} />
            </Button>
            <span className="hidden lg:inline text-xs text-muted-foreground ml-1 mr-1">{fontSize}px</span>
            <CopyButton
              getText={() => `${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ''}\n\n${activeArticle.content}`}
              message="복사됨"
              className="h-7 w-7 p-0"
            />
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="text-foreground leading-relaxed break-words whitespace-pre-wrap font-maruburi"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: "1.8",
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}
        onClick={handleContentClick}
        dangerouslySetInnerHTML={{ __html: activeArticleHtml }}
      />

      {/* 조문 이력 */}
      {!isOrdinance && revisionHistory.length > 0 && (
        <div className="mt-12">
          <RevisionHistory
            history={revisionHistory}
            articleTitle={`${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ""}`}
          />
        </div>
      )}

      {/* 판례 섹션 */}
      {showPrecedents && precedentViewMode === "bottom" && handleViewPrecedentDetail && expandPrecedentPanel && collapsePrecedentPanel && (
        <div className="mt-8">
          <PrecedentSection
            precedents={precedents}
            totalCount={precedentTotalCount}
            loading={loadingPrecedents}
            error={precedentsError}
            selectedPrecedent={selectedPrecedent}
            loadingDetail={loadingPrecedentDetail}
            viewMode={precedentViewMode}
            onViewDetail={handleViewPrecedentDetail}
            onExpand={expandPrecedentPanel}
            onCollapse={collapsePrecedentPanel}
          />
        </div>
      )}
    </div>
  )
}
