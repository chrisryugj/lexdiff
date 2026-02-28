/**
 * ai-search-loading/index.tsx
 *
 * AI 검색 로딩 메인 컴포넌트
 * - GPT 스타일 타이핑 효과
 * - 6단계 프로그레스 표시
 * - 메타정보 표시 (질문 유형, 키워드 등)
 */

"use client"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { StageIndicator } from "./stage-indicator"
import { TypingText } from "./typing-text"
import type { AISearchStage, AISearchMeta } from "../search-result-view/types"

interface AISearchLoadingProps {
  /** 현재 단계 */
  stage: AISearchStage
  /** 진행률 (0-100) */
  progress: number
  /** 스트리밍 중인 텍스트 */
  streamingText?: string
  /** 메타정보 (AI Router 결과) */
  meta?: AISearchMeta
  /** 사용자 질문 */
  userQuery?: string
  /** 추가 클래스명 */
  className?: string
}

const QUERY_TYPE_LABELS: Record<string, string> = {
  definition: "정의 질문",
  requirement: "요건 질문",
  procedure: "절차 질문",
  comparison: "비교 질문",
  application: "적용 질문",
  consequence: "결과 질문",
  scope: "범위 질문",
  exemption: "예외 질문",
}

export function AISearchLoading({
  stage,
  progress,
  streamingText,
  meta,
  userQuery,
  className,
}: AISearchLoadingProps) {

  // 스트리밍 시작 전 로딩 상태
  const isPreStreaming = !streamingText && stage !== "complete"

  return (
    <div className={cn("space-y-6", className)}>
      {/* 사용자 질문 표시 */}
      {userQuery && (
        <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
          <Icon name="user" className="h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm">{userQuery}</p>
        </div>
      )}

      {/* 단계 표시 */}
      <div className="p-4 bg-card border border-border rounded-lg">
        <StageIndicator
          currentStage={stage}
          progress={progress}
        />
      </div>

      {/* 메타정보 표시 (분석 완료 후) */}
      {meta && (meta.queryType || meta.keywords?.length) && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted/20 rounded-lg text-sm">
          {meta.queryType && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full">
              <Icon name="bookmark" className="h-3.5 w-3.5" />
              {QUERY_TYPE_LABELS[meta.queryType] || meta.queryType}
            </span>
          )}
          {meta.domain && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">
              <Icon name="book-open" className="h-3.5 w-3.5" />
              {meta.domain}
            </span>
          )}
          {meta.keywords && meta.keywords.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full">
              <Icon name="zap" className="h-3.5 w-3.5" />
              {meta.keywords.slice(0, 3).join(", ")}
              {meta.keywords.length > 3 && ` +${meta.keywords.length - 3}`}
            </span>
          )}
        </div>
      )}

      {/* AI 응답 영역 */}
      <div className="min-h-[200px] p-4 bg-card border border-border rounded-lg">
        {/* 스트리밍 전: 로딩 애니메이션 */}
        {isPreStreaming && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Icon name="brain" className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">AI 법률 어시스턴트</span>
                <span className="text-xs text-muted-foreground">답변 준비 중...</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon name="loader" className="h-4 w-4 animate-spin" />
                <span className="text-sm animate-pulse">
                  {stage === "analyzing" && "질문을 분석하고 있습니다..."}
                  {stage === "optimizing" && "검색어를 최적화하고 있습니다..."}
                  {stage === "searching" && "관련 법령을 검색하고 있습니다..."}
                  {stage === "extracting" && "인용 조문을 추출하고 있습니다..."}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 스트리밍 중: 타이핑 효과 */}
        {streamingText && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Icon name="brain" className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-sm">AI 법률 어시스턴트</span>
                {stage !== "complete" && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    답변 생성 중...
                  </span>
                )}
              </div>
              <TypingText
                text={streamingText}
                speed={stage === "complete" ? 5 : 10}
                renderMarkdown={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { StageIndicator } from "./stage-indicator"
export { TypingText } from "./typing-text"
