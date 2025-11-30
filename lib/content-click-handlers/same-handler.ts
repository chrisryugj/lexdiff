/**
 * Same Reference Handler
 * "같은 법 제N조" 형식의 링크 처리
 * data-ref="same" 타입
 */

import type { ContentClickContext, ContentClickActions } from './types'

export async function handleSameRef(
  target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions
): Promise<void> {
  const { lastExternalRef } = context
  const { openExternalLawArticleModal, setLastExternalRef } = actions

  // 이전 외부 참조가 없으면 무시
  if (!lastExternalRef?.joLabel) return

  const part = target.getAttribute('data-part') || ''
  // 기존 조항에서 "제N항제N호" 부분 제거 후 새 part 추가
  const base = lastExternalRef.joLabel.replace(/제\d+항(제\d+호)?/, '').trim()
  const articleLabel = `${base}${part}`

  await openExternalLawArticleModal(lastExternalRef.lawName, articleLabel)
  setLastExternalRef({ lawName: lastExternalRef.lawName, joLabel: articleLabel })
}
