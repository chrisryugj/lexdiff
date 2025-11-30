/**
 * Law Reference Handler
 * 법령명 링크 처리 (조문번호 선택적)
 * data-ref="law" 타입
 */

import type { ContentClickContext, ContentClickActions } from './types'

export async function handleLawRef(
  target: HTMLElement,
  _context: ContentClickContext,
  actions: ContentClickActions
): Promise<void> {
  const { openExternalLawArticleModal, setLastExternalRef } = actions

  const lawName = target.getAttribute('data-law') || ''

  // 다음 형제 엘리먼트가 article 링크인지 확인
  let articleLabel = ''
  const next = target.nextElementSibling as HTMLElement | null
  if (
    next &&
    next.tagName === 'A' &&
    next.classList.contains('law-ref') &&
    next.getAttribute('data-ref') === 'article'
  ) {
    articleLabel = next.getAttribute('data-article') || ''
  }

  // 조문 번호가 있든 없든 모달로 표시 (없으면 첫 번째 조문)
  await openExternalLawArticleModal(lawName, articleLabel)
  setLastExternalRef({ lawName, joLabel: articleLabel })
}
