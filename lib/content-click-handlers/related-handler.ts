/**
 * Related Law Reference Handler
 * 시행령/시행규칙 링크 처리 (AI 모드: 새 창, 일반 모드: 탭 전환)
 * data-ref="related" 타입
 */

import { debugLogger } from '@/lib/debug-logger'
import type { ContentClickContext, ContentClickActions } from './types'

export async function handleRelatedRef(
  target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions
): Promise<void> {
  const {
    aiAnswerMode,
    userQuery,
    relatedArticles,
    aiAnswerContent,
    aiCitations,
    activeArticle,
    threeTierDelegation,
    threeTierCitation,
  } = context
  const {
    fetchThreeTierData,
    setShowAdminRules,
    setAdminRuleViewMode,
    setAdminRuleHtml,
    setTierViewMode,
    setDelegationActiveTab,
  } = actions

  const kind = target.getAttribute('data-kind') || 'decree'

  // AI 답변 모드: 법령명 추론하여 새 창으로 열기
  if (aiAnswerMode) {
    const { inferLawNameFromArticle } = await import('@/lib/ai-law-inference')

    const inferred = inferLawNameFromArticle('', {
      userQuery,
      relatedLaws: relatedArticles,
      aiAnswerContent,
      citations: aiCitations,
    })

    if (inferred) {
      const baseLawName = inferred.lawName.replace(/\s*(법|규칙|조례)$/, '$1')
      const relatedLawName =
        kind === 'decree'
          ? `${baseLawName} 시행령`
          : kind === 'rule'
            ? `${baseLawName} 시행규칙`
            : baseLawName

      window.open(
        `https://www.law.go.kr/법령/${encodeURIComponent(relatedLawName)}`,
        '_blank',
        'noopener'
      )
      return
    }
  }

  // 일반 모드: 3단 비교 뷰로 전환
  if (!activeArticle) return

  // 3단 데이터 로드 (필요시)
  if (!threeTierDelegation && !threeTierCitation) {
    await fetchThreeTierData()
  }

  // 행정규칙 뷰 닫고 위임법령 뷰로 전환
  setShowAdminRules(false)
  setAdminRuleViewMode('list')
  setAdminRuleHtml(null)
  setTierViewMode('2-tier')

  // kind에 따라 탭 선택
  if (kind === 'decree') {
    setDelegationActiveTab('decree')
    debugLogger.info('탭 전환 (related): 시행령')
  } else if (kind === 'rule') {
    setDelegationActiveTab('rule')
    debugLogger.info('탭 전환 (related): 시행규칙')
  }
}
