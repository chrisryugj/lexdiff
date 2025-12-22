/**
 * law-viewer-skeleton.tsx
 *
 * 법령 뷰어 로딩 스켈레톤 컴포넌트
 * - 헤더 스켈레톤
 * - 중앙 스피너 + 상태 메시지
 * - 조문 목록 스켈레톤
 */

import { Icon } from "@/components/ui/icon"
import type { SearchStage } from "./search-result-view/types"

interface LawViewerSkeletonProps {
  stage?: SearchStage
  message?: string
}

const STAGE_MESSAGES: Record<string, string> = {
  searching: "국가법령정보 API 검색 중...",
  parsing: "법령 데이터 파싱 중...",
  complete: "로딩 완료",
}

export function LawViewerSkeleton({ stage = 'searching', message }: LawViewerSkeletonProps) {
  const displayMessage = message || STAGE_MESSAGES[stage] || STAGE_MESSAGES.searching

  return (
    <div className="space-y-6 p-4">
      {/* 헤더 스켈레톤 */}
      <div className="animate-pulse space-y-2">
        <div className="h-8 bg-muted rounded w-2/5" />
        <div className="h-4 bg-muted rounded w-1/4" />
      </div>

      {/* 중앙 로딩 스피너 + 메시지 */}
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="relative">
          <Icon
            name="loader"
            className="h-10 w-10 animate-spin text-primary"
          />
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">
          {displayMessage}
        </p>
      </div>

      {/* 조문 목록 스켈레톤 */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse space-y-2 border-b border-border/50 pb-4">
            {/* 조문 번호 */}
            <div className="h-5 bg-muted rounded w-24" />
            {/* 조문 제목 */}
            <div className="h-4 bg-muted rounded w-1/3" />
            {/* 조문 내용 */}
            <div className="space-y-1.5">
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-4 bg-muted rounded w-4/6" />
            </div>
          </div>
        ))}
      </div>

      {/* 하단 여백 */}
      <div className="h-8" />
    </div>
  )
}
