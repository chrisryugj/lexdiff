/**
 * Regulation Reference Handler
 * 행정규칙 링크 처리 (탭 전환)
 * data-ref="regulation" 타입
 */

import type { ContentClickContext, ContentClickActions } from './types'

export async function handleRegulationRef(
  _target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions
): Promise<void> {
  const { threeTierDelegation, threeTierCitation, showAdminRules } = context
  const {
    fetchThreeTierData,
    setShowAdminRules,
    setAdminRuleViewMode,
    setTierViewMode,
    setDelegationActiveTab,
  } = actions

  // 3단 데이터 로드 (필요시)
  if (!threeTierDelegation && !threeTierCitation) {
    await fetchThreeTierData()
  }

  // 행정규칙 활성화
  if (!showAdminRules) {
    setShowAdminRules(true)
  }

  // 2-tier 뷰로 전환, 행정규칙 탭 선택
  setAdminRuleViewMode('list')
  setTierViewMode('2-tier')
  setDelegationActiveTab('admin')
}
