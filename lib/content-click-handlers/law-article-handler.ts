/**
 * Law-Article Reference Handler
 * 법령+조문 복합 링크 처리 (위임법령 탭 전환 또는 모달)
 * data-ref="law-article" 타입
 */

import { debugLogger } from '@/lib/debug-logger'
import type { ContentClickContext, ContentClickActions } from './types'

export async function handleLawArticleRef(
  target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions
): Promise<void> {
  const { tierViewMode, threeTierDelegation, threeTierCitation, validDelegations } = context
  const {
    fetchThreeTierData,
    setDelegationActiveTab,
    setTierViewMode,
    openExternalLawArticleModal,
    setLastExternalRef,
  } = actions

  const lawName = target.getAttribute('data-law') || ''
  const articleLabel = target.getAttribute('data-article') || ''
  const lawType = target.getAttribute('data-law-type') as 'law' | 'decree' | 'rule' | null

  // 2-tier 모드에서만 탭 전환 시도
  if (tierViewMode === '2-tier' && lawType) {
    // 3단 데이터 로드 (필요시)
    if (!threeTierDelegation && !threeTierCitation) {
      await fetchThreeTierData()
    }

    let tabSwitched = false

    if (lawType === 'decree' && validDelegations.some(d => d.type === '시행령')) {
      setDelegationActiveTab('decree')
      tabSwitched = true
      debugLogger.info('탭 전환: 시행령', { lawName, articleLabel })
    } else if (lawType === 'rule' && validDelegations.some(d => d.type === '시행규칙')) {
      setDelegationActiveTab('rule')
      tabSwitched = true
      debugLogger.info('탭 전환: 시행규칙', { lawName, articleLabel })
    } else if (lawType === 'law') {
      // 시행령/시행규칙 본문에서 법률 링크 클릭 → 1-tier로 전환
      setTierViewMode('1-tier')
      tabSwitched = true
      debugLogger.info('탭 전환: 법률 본문', { lawName, articleLabel })
    }

    // 탭 전환 성공 시 모달 열지 않음 (모바일 UX)
    if (tabSwitched) {
      setLastExternalRef({ lawName, joLabel: articleLabel })
      return
    }
  }

  // 탭 전환 실패 또는 2-tier 모드가 아닐 때 모달 열기
  await openExternalLawArticleModal(lawName, articleLabel)
  setLastExternalRef({ lawName, joLabel: articleLabel })
}
