/**
 * Annex Reference Handler
 * 별표(附表) 링크 클릭 처리
 * data-ref="annex" 타입
 */

import { debugLogger } from '@/lib/debug-logger'
import type { ContentClickContext, ContentClickActions } from './types'

/**
 * 유사 법령명 판별: 의회/시행령 등 접미사 차이만 있는 같은 계열 법령인지
 * "광진구의회 복무 조례" vs "광진구 복무 조례" → true
 * "관세법" vs "광진구 복무 조례" → false
 */
function isSimilarLawName(a: string, b: string): boolean {
  if (!a || !b) return false
  const normalize = (s: string) => s.replace(/\s+/g, '').replace(/의회/, '')
  const na = normalize(a)
  const nb = normalize(b)
  // 의회 제거 후 같거나, 한쪽이 다른쪽을 포함
  return na === nb || na.includes(nb) || nb.includes(na)
}

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

  // 법령명 결정: 별표는 거의 항상 현재 보고 있는 법령 소속
  // currentLaw가 유효하면 우선 사용, data-law는 명백히 다른 법령일 때만
  const dataLaw = target.getAttribute('data-law')
  const currentLaw = refModal?.lawName || meta.lawTitle
  const hasValidCurrentLaw = currentLaw && currentLaw !== 'AI 답변' && currentLaw.trim() !== ''

  let lawName: string | undefined
  if (hasValidCurrentLaw) {
    // 법령 뷰어에서 보고 있는 법령이 있으면 → 별표는 무조건 현재 법령 소속
    // (본문 내 「다른법령」 인용 뒤에 오는 별표도 현재 법령의 별표임)
    lawName = currentLaw
    if (dataLaw && dataLaw !== currentLaw) {
      debugLogger.info('[annex-handler] data-law 무시 → currentLaw 우선', { dataLaw, currentLaw })
    }
  } else {
    // currentLaw 없음 (AI 답변 등) → data-law 사용
    lawName = dataLaw || currentLaw
  }

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
