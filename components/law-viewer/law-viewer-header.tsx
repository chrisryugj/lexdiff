import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/revision-parser"
import type { LawMeta, LawArticle } from "@/lib/law-types"

interface LawViewerHeaderProps {
  meta: LawMeta
  isPrecedent: boolean
  isOrdinance: boolean
  viewMode: "single" | "full"
  activeArticle: LawArticle | undefined
  hasLevelSection: boolean
  currentCourtLevel: number | null
  favoriteCount: number
  articlesLength: number
  formatSimpleJo: (jo: string, forceOrdinance?: boolean) => string
}

export function LawViewerHeader({
  meta,
  isPrecedent,
  isOrdinance,
  viewMode,
  activeArticle,
  hasLevelSection,
  currentCourtLevel,
  favoriteCount,
  articlesLength,
  formatSimpleJo,
}: LawViewerHeaderProps) {
  return (
    <div className="border-b border-border px-3 sm:px-4 pt-4 sm:pt-6 pb-2 sm:pb-3.5">
      <div className="flex items-center gap-2 mb-1">
        <Icon name={isPrecedent ? "gavel" : "book-open"} size={20} className="text-primary" />
        <h2 className="text-xl font-bold text-foreground">{meta.lawTitle}</h2>
        {/* 심급 배지 - 제목 옆에 표시 */}
        {isPrecedent && hasLevelSection && currentCourtLevel && (
          <Badge
            className={cn(
              "text-xs px-1.5 py-0.5 font-medium",
              currentCourtLevel === 3 && "bg-purple-500/20 text-purple-400 border-purple-500/30",
              currentCourtLevel === 2 && "bg-blue-500/20 text-blue-400 border-blue-500/30",
              currentCourtLevel === 1 && "bg-green-500/20 text-green-400 border-green-500/30"
            )}
          >
            {currentCourtLevel}심
          </Badge>
        )}
        {!isPrecedent && !isOrdinance && viewMode === "full" && (
          <Badge variant="outline" className="text-xs">
            전체 조문
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {isPrecedent ? (
          // 판례 전용 배지
          <>
            {meta.caseNumber && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                <Icon name="file-text" size={12} className="mr-1" />
                {meta.caseNumber}
              </Badge>
            )}
            {meta.promulgationDate && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                <Icon name="calendar" size={12} className="mr-1" />
                선고일: {meta.promulgationDate}
              </Badge>
            )}
            {meta.lawType && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                {meta.lawType}
              </Badge>
            )}
          </>
        ) : (
          // 법령 전용 배지
          <>
            {meta.latestEffectiveDate && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                <Icon name="calendar" size={12} className="mr-1" />
                {formatDate(meta.latestEffectiveDate)}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs px-1.5 py-0.5">
              <Icon name="file-text" size={12} className="mr-1" />
              {articlesLength}개 조문
            </Badge>

            {isOrdinance && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs px-1.5 py-0.5">
                <Icon name="building-2" size={12} className="mr-1" />
                자치법규
              </Badge>
            )}
            {meta.revisionType && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                {meta.revisionType}
              </Badge>
            )}
          </>
        )}

        {/* 법령 전체 즐겨찾기 개수 - 판례는 제외 */}
        {!isPrecedent && favoriteCount > 0 && (
          <Badge
            key={`header-fav-count-${favoriteCount}`}
            variant="outline"
            className="text-xs px-1.5 py-0.5"
          >
            <Icon name="star" size={12} className="mr-1 fill-yellow-400 text-yellow-500" />
            {favoriteCount}
          </Badge>
        )}
        {!isPrecedent && !isOrdinance && viewMode === "full" && activeArticle && (
          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
            현재: {formatSimpleJo(activeArticle.jo)}
          </Badge>
        )}
      </div>
    </div>
  )
}
