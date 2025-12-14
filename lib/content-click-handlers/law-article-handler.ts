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
  const {
    tierViewMode,
    threeTierDelegation,
    threeTierCitation,
    validDelegations,
    aiAnswerMode,
    userQuery,
    relatedArticles,
    aiAnswerContent,
    aiCitations,
  } = context
  const {
    fetchThreeTierData,
    setDelegationActiveTab,
    setTierViewMode,
    openExternalLawArticleModal,
    setLastExternalRef,
    toast,
  } = actions

  let lawName = target.getAttribute('data-law') || ''
  const articleLabel = target.getAttribute('data-article') || ''
  const lawType = target.getAttribute('data-law-type') as 'law' | 'decree' | 'rule' | null
  const { refModal } = context

  // 모달에서 클릭 시: "법 제X조" 형태 링크는 현재 모달의 법령에서 상위법 추론
  // 예: "건설산업기본법 시행령" 모달에서 "법 제28조" 클릭 → "건설산업기본법"
  if (!lawName && refModal?.lawName && lawType === 'law') {
    const modalLawName = refModal.lawName
    // 시행령/시행규칙에서 상위법 추출
    const baseLawName = modalLawName.replace(/\s*(시행령|시행규칙)$/, '')
    if (baseLawName !== modalLawName) {
      lawName = baseLawName
      debugLogger.info('[law-article-handler] 모달 법령에서 상위법 추론', {
        modalLawName,
        inferredLawName: lawName,
        articleLabel,
      })
    }
  }

  // AI 답변 모드에서 법령명이 비어있으면 추론 시도
  if (!lawName && aiAnswerMode) {
    const { inferLawNameFromArticle } = await import('@/lib/ai-law-inference')

    const inferred = inferLawNameFromArticle(articleLabel, {
      userQuery,
      relatedLaws: relatedArticles,
      aiAnswerContent,
      citations: aiCitations,
    })

    if (inferred) {
      debugLogger.info('[law-article-handler] 법령명 자동 추론', {
        article: articleLabel,
        lawName: inferred.lawName,
        confidence: inferred.confidence,
        reason: inferred.reason,
      })
      lawName = inferred.lawName
    } else {
      // 추론 실패
      debugLogger.warning('[law-article-handler] 법령명 추론 실패', { articleLabel })
      toast({
        title: '법령명을 찾을 수 없습니다',
        description: `"${articleLabel}"의 법령명을 자동으로 찾을 수 없습니다. 「법령명」과 함께 명시된 링크를 클릭해주세요.`,
        variant: 'destructive',
      })
      return
    }
  }

  // 법령명이 여전히 비어있으면 에러
  if (!lawName) {
    debugLogger.warning('[law-article-handler] 법령명 없음', { articleLabel })
    toast({
      title: '법령 정보 부족',
      description: '법령명 정보가 없어 조문을 조회할 수 없습니다.',
      variant: 'destructive',
    })
    return
  }

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
