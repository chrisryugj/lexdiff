/**
 * Content Click Handlers Hook
 * 법령 콘텐츠 내 링크 클릭 이벤트 처리를 위한 커스텀 훅
 */

import { useCallback } from 'react'
import type {
  ContentClickContext,
  ContentClickActions,
  RefHandler,
  AnnexActions,
} from '@/lib/content-click-handlers'
import {
  handleArticleRef,
  handleLawRef,
  handleRegulationRef,
  handleLawArticleRef,
  handleSameRef,
  handleRelatedRef,
  handleAnnexRef,
  handlePrecedentRef,
} from '@/lib/content-click-handlers'

/** 링크 타입별 핸들러 매핑 */
const HANDLERS: Record<string, RefHandler> = {
  article: handleArticleRef,
  law: handleLawRef,
  regulation: handleRegulationRef,
  'law-article': handleLawArticleRef,
  same: handleSameRef,
  related: handleRelatedRef,
  annex: handleAnnexRef as RefHandler,
  precedent: handlePrecedentRef,
}

/**
 * 콘텐츠 클릭 핸들러 훅
 * @param context - 읽기 전용 상태 컨텍스트
 * @param actions - 상태 변경 액션 함수들
 */
export function useContentClickHandlers(
  context: ContentClickContext,
  actions: ContentClickActions
) {
  const handleContentClick: React.MouseEventHandler<HTMLDivElement> = useCallback(
    async (e) => {
      const target = e.target as HTMLElement
      if (!target || target.tagName !== 'A') return

      e.preventDefault()
      e.stopPropagation()

      const refType = target.getAttribute('data-ref')
      if (!refType) return

      const handler = HANDLERS[refType]
      if (handler) {
        await handler(target, context, actions)
      }
    },
    [context, actions]
  )

  return { handleContentClick }
}
