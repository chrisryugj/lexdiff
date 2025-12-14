/**
 * Annex Reference Handler
 * 별표(附表) 링크 클릭 처리
 * data-ref="annex" 타입
 */

import { debugLogger } from '@/lib/debug-logger'
import type { ContentClickContext, ContentClickActions } from './types'

/** 별표 모달 열기 액션 확장 */
export interface AnnexActions {
  openAnnexModal?: (annexNumber: string, lawName: string, lawId?: string) => void
}

export async function handleAnnexRef(
  target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions & AnnexActions
): Promise<void> {
  const annexNumber = target.getAttribute('data-annex')

  if (!annexNumber) {
    debugLogger.warning('[annex-handler] data-annex 속성 없음')
    return
  }

  const { meta, refModal } = context

  // 법령명 결정 우선순위:
  // 1. data-law 속성 (링크에 직접 지정된 법령명)
  // 2. refModal.lawName (모달에서 현재 보고 있는 법령)
  // 3. meta.lawTitle (법령 뷰어에서 보고 있는 법령)
  const dataLaw = target.getAttribute('data-law')
  const lawName = dataLaw || refModal?.lawName || meta.lawTitle

  // 법령명이 없거나 빈 문자열이면 경고
  if (!lawName || lawName.trim() === '' || lawName === 'AI 답변') {
    debugLogger.warning('[annex-handler] 법령명 없이 별표 클릭 - 링크에 법령명 정보 필요', {
      dataLaw,
      refModalLawName: refModal?.lawName,
      metaLawTitle: meta.lawTitle,
    })
    actions.toast({
      title: '별표 조회 불가',
      description: '별표와 연결된 법령명 정보가 없습니다. 법령 뷰어에서 직접 조회해주세요.',
      variant: 'destructive',
    })
    return
  }

  const lawId = meta.lawId || meta.mst

  debugLogger.info('[annex-handler] 별표 클릭', {
    annexNumber,
    lawName,
    lawId,
    dataLaw: dataLaw || '(없음)',
  })

  // openAnnexModal 액션이 있으면 호출
  if (actions.openAnnexModal) {
    actions.openAnnexModal(annexNumber, lawName, lawId)
  } else {
    // 폴백: 토스트로 안내
    actions.toast({
      title: `별표 ${annexNumber}`,
      description: '별표 조회 기능을 사용할 수 없습니다.',
      variant: 'default',
    })
  }
}
