/**
 * Article Reference Handler
 * 조문 참조 링크 처리 (가장 복잡한 핸들러)
 * data-ref="article" 타입
 */

import { debugLogger } from '@/lib/debug-logger'
import { buildJO, formatJO } from '@/lib/law-parser'
import { extractArticleText } from '@/lib/law-xml-parser'
import type { ContentClickContext, ContentClickActions } from './types'

export async function handleArticleRef(
  target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions
): Promise<void> {
  const {
    meta,
    articles,
    aiAnswerMode,
    userQuery,
    relatedArticles,
    aiAnswerContent,
    aiCitations,
    lastExternalRef,
    refModal,
  } = context
  const {
    openExternalLawArticleModal,
    setRefModal,
    setRefModalHistory,
    setLastExternalRef,
    toast,
  } = actions

  const articleLabel = target.getAttribute('data-article') || ''

  // 1. 바로 앞에 법령명 링크가 있으면 외부 법령으로 처리
  const prev = target.previousElementSibling as HTMLElement | null
  if (
    prev &&
    prev.tagName === 'A' &&
    prev.classList.contains('law-ref') &&
    prev.getAttribute('data-ref') === 'law'
  ) {
    const lawName = prev.getAttribute('data-law') || ''
    await openExternalLawArticleModal(lawName, articleLabel)
    setLastExternalRef({ lawName, joLabel: articleLabel })
    return
  }

  // 2. AI 답변 모드: 법령명 자동 추론
  if (aiAnswerMode) {
    const { inferLawNameFromArticle } = await import('@/lib/ai-law-inference')

    const inferred = inferLawNameFromArticle(articleLabel, {
      userQuery,
      relatedLaws: relatedArticles,
      aiAnswerContent,
      citations: aiCitations,
    })

    if (inferred) {
      debugLogger.info('법령명 자동 추론', {
        article: articleLabel,
        lawName: inferred.lawName,
        confidence: inferred.confidence,
        reason: inferred.reason,
      })

      await openExternalLawArticleModal(inferred.lawName, articleLabel)
      setLastExternalRef({ lawName: inferred.lawName, joLabel: articleLabel })
      return
    }

    // 추론 실패 시 lastExternalRef 사용 (fallback)
    if (lastExternalRef?.lawName) {
      await openExternalLawArticleModal(lastExternalRef.lawName, articleLabel)
      setLastExternalRef({ ...lastExternalRef, joLabel: articleLabel })
      return
    }

    // 둘 다 실패 시 에러 메시지
    toast({
      title: '법령명을 찾을 수 없습니다',
      description: `"${articleLabel}"의 법령명을 자동으로 찾을 수 없습니다. 법령명과 함께 명시된 링크를 클릭해주세요.`,
      variant: 'destructive',
    })
    return
  }

  // 3. 일반 모드: 현재 법령에서 조문 검색
  try {
    const joCode = buildJO(articleLabel)
    const found = articles.find(
      (a) => a.jo === joCode || formatJO(a.jo) === formatJO(joCode)
    )

    if (found) {
      // 현재 모달이 열려있으면 히스토리에 저장
      if (refModal.open && refModal.title) {
        setRefModalHistory((prev) => [
          ...prev,
          {
            title: refModal.title!,
            html: refModal.html,
            forceWhiteTheme: refModal.forceWhiteTheme,
            lawName: refModal.lawName,
            articleNumber: refModal.articleNumber,
          },
        ])
      }

      setRefModal({
        open: true,
        title: `${meta.lawTitle} ${formatJO(found.jo)}${found.title ? ` (${found.title})` : ''}`,
        html: extractArticleText(found, false, meta.lawTitle),
        lawName: meta.lawTitle,
        articleNumber: formatJO(found.jo),
      })
      return
    }
  } catch {
    // buildJO 실패 시 무시하고 외부 법령 fallback
  }

  // 4. 못 찾으면 외부 법령으로 처리
  if (lastExternalRef?.lawName) {
    await openExternalLawArticleModal(lastExternalRef.lawName, articleLabel)
    setLastExternalRef({ lawName: lastExternalRef.lawName, joLabel: articleLabel })
  } else {
    // Fallback: 법제처 새 창으로 열기
    window.open(
      `https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle)}/${articleLabel}`,
      '_blank',
      'noopener'
    )
  }
}
