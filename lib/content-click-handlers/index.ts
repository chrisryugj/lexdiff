/**
 * Content Click Handlers - Export Index
 * 법령 콘텐츠 내 링크 클릭 핸들러 통합 export
 */

// Types
export type {
  ContentClickContext,
  ContentClickActions,
  RefHandler,
  RefModalState,
  ModalHistoryItem,
  ExternalRef,
  ToastOptions,
} from './types'

// Handlers
export { handleArticleRef } from './article-handler'
export { handleLawRef } from './law-handler'
export { handleRegulationRef } from './regulation-handler'
export { handleLawArticleRef } from './law-article-handler'
export { handleSameRef } from './same-handler'
export { handleRelatedRef } from './related-handler'
export { handleAnnexRef, type AnnexActions } from './annex-handler'
