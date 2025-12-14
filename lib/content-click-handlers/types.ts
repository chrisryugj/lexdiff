/**
 * Content Click Handlers - Type Definitions
 * 법령 콘텐츠 내 링크 클릭 핸들러용 공통 타입
 */

import type { LawArticle, LawMeta, ThreeTierData } from '@/lib/law-types'
import type { ParsedRelatedLaw } from '@/lib/law-parser'
import type { VerifiedCitation } from '@/lib/citation-verifier'

/** 모달 히스토리 아이템 */
export interface ModalHistoryItem {
  title: string
  html?: string
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
}

/** 모달 상태 */
export interface RefModalState {
  open: boolean
  title?: string
  html?: string
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
}

/** 외부 참조 정보 */
export interface ExternalRef {
  lawName: string
  joLabel?: string
}

/** 핸들러 공통 컨텍스트 (읽기 전용 상태) */
export interface ContentClickContext {
  // 현재 법령 정보
  meta: LawMeta
  articles: LawArticle[]
  activeArticle?: LawArticle

  // AI Mode
  aiAnswerMode: boolean
  userQuery?: string
  aiAnswerContent?: string
  aiCitations?: VerifiedCitation[]
  relatedArticles?: ParsedRelatedLaw[]

  // Three-Tier
  tierViewMode: '1-tier' | '2-tier' | '3-tier'
  threeTierDelegation: ThreeTierData | null
  threeTierCitation: ThreeTierData | null
  validDelegations: Array<{ type: string; content: string }>

  // Admin Rules
  showAdminRules: boolean

  // External Reference
  lastExternalRef: ExternalRef | null

  // Modal
  refModal: RefModalState
}

/** 토스트 옵션 */
export interface ToastOptions {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

/** 핸들러 공통 액션 (상태 변경 함수) */
export interface ContentClickActions {
  // Navigation
  setActiveJo: (jo: string) => void

  // Modal
  openExternalLawArticleModal: (lawName: string, articleLabel: string) => Promise<void>
  setRefModal: (state: RefModalState) => void
  setRefModalHistory: (updater: (prev: ModalHistoryItem[]) => ModalHistoryItem[]) => void
  setLastExternalRef: (ref: ExternalRef | null) => void

  // Three-tier
  fetchThreeTierData: () => Promise<void>
  setTierViewMode: (mode: '1-tier' | '2-tier' | '3-tier') => void
  setDelegationActiveTab: (tab: 'law' | 'decree' | 'rule' | 'admin') => void

  // Admin rules
  setShowAdminRules: (show: boolean) => void
  setAdminRuleViewMode: (mode: 'list' | 'detail') => void
  setAdminRuleHtml: (html: string | null) => void

  // Utilities
  toast: (options: ToastOptions) => void

  // 별표 모달 (선택적 - 별표 핸들러 전용)
  openAnnexModal?: (annexNumber: string, lawName: string, lawId?: string) => void
}

/** 핸들러 함수 시그니처 */
export type RefHandler = (
  target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions
) => Promise<void>
