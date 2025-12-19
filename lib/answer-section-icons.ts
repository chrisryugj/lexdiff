/**
 * Answer Section Icons
 *
 * AI 답변의 구조화된 섹션에 사용할 아이콘 매핑
 * 이모지 대신 일관된 아이콘 시스템 제공
 */

import { ICON_REGISTRY, type IconType } from '@/lib/icons'

/**
 * AI 답변 섹션 타입
 */
export type AnswerSectionType =
  | 'summary'       // 핵심 요약
  | 'detail'        // 상세 내용
  | 'tip'           // 추가 참고
  | 'related_laws'  // 관련 법령
  | 'conditions'    // 조건·예외

/**
 * 상세 내용 하위 섹션 타입
 */
export type DetailSubsectionType =
  | 'article_quote' // 조문 발췌
  | 'interpretation' // 핵심 해석
  | 'practice'      // 실무 적용

/**
 * 경고/알림 타입
 */
export type AlertType =
  | 'info'      // 일반 정보
  | 'warning'   // 경고
  | 'error'     // 오류
  | 'success'   // 성공

/**
 * 신뢰도 레벨
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/**
 * 섹션별 아이콘 및 스타일 정의
 */
export const SECTION_CONFIGS: Record<AnswerSectionType, {
  icon: IconType
  label: string
  iconColor: string
  bgColor: string
  borderColor: string
}> = {
  summary: {
    icon: ICON_REGISTRY['file-text'],
    label: '핵심 요약',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  detail: {
    icon: ICON_REGISTRY['scroll-text'],
    label: '상세 내용',
    iconColor: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },
  tip: {
    icon: ICON_REGISTRY['lightbulb'],
    label: '추가 참고',
    iconColor: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  related_laws: {
    icon: ICON_REGISTRY['book-open'],
    label: '관련 법령',
    iconColor: 'text-cyan-500 dark:text-cyan-400',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950/20',
    borderColor: 'border-cyan-200 dark:border-cyan-800'
  },
  conditions: {
    icon: ICON_REGISTRY['alert-triangle'],
    label: '조건·예외',
    iconColor: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800'
  }
}

/**
 * 상세 내용 하위 섹션 아이콘 정의
 */
export const DETAIL_SUBSECTION_CONFIGS: Record<DetailSubsectionType, {
  icon: IconType
  label: string
  iconColor: string
}> = {
  article_quote: {
    icon: ICON_REGISTRY['file-text'],
    label: '조문 발췌',
    iconColor: 'text-gray-600 dark:text-gray-400'
  },
  interpretation: {
    icon: ICON_REGISTRY['lightbulb'],
    label: '핵심 해석',
    iconColor: 'text-blue-600 dark:text-blue-400'
  },
  practice: {
    icon: ICON_REGISTRY['check-circle-2'],
    label: '실무 적용',
    iconColor: 'text-green-600 dark:text-green-400'
  }
}

/**
 * 경고/알림 타입별 아이콘 및 스타일
 */
export const ALERT_CONFIGS: Record<AlertType, {
  icon: IconType
  iconColor: string
  bgColor: string
  borderColor: string
  textColor: string
}> = {
  info: {
    icon: ICON_REGISTRY['info'],
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-300'
  },
  warning: {
    icon: ICON_REGISTRY['alert-triangle'],
    iconColor: 'text-yellow-500 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-800 dark:text-yellow-200'
  },
  error: {
    icon: ICON_REGISTRY['alert-octagon'],
    iconColor: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-700 dark:text-red-300'
  },
  success: {
    icon: ICON_REGISTRY['check-circle-2'],
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800',
    textColor: 'text-green-700 dark:text-green-300'
  }
}

/**
 * 신뢰도 레벨별 아이콘 및 스타일
 */
export const CONFIDENCE_CONFIGS: Record<ConfidenceLevel, {
  icon: IconType
  label: string
  iconColor: string
  bgColor: string
  borderColor: string
  textColor: string
}> = {
  high: {
    icon: ICON_REGISTRY['check-circle-2'],
    label: '신뢰도 높음',
    iconColor: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    textColor: 'text-green-700 dark:text-green-300'
  },
  medium: {
    icon: ICON_REGISTRY['alert-circle'],
    label: '신뢰도 보통',
    iconColor: 'text-yellow-600 dark:text-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-700 dark:text-yellow-300'
  },
  low: {
    icon: ICON_REGISTRY['alert-octagon'],
    label: '신뢰도 낮음',
    iconColor: 'text-red-600 dark:text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-700 dark:text-red-300'
  }
}

/**
 * 법령 타입별 아이콘
 */
export const LAW_TYPE_ICONS = {
  law: ICON_REGISTRY['scale'],        // 법률
  ordinance: ICON_REGISTRY['book-open'], // 조례
  ai: ICON_REGISTRY['brain'],         // AI 검색
  sparkles: ICON_REGISTRY['sparkles'] // AI 특수 효과
} as const

/**
 * 텍스트에서 섹션 타입 자동 감지 (이모지 제거)
 */
export function detectSectionType(text: string): AnswerSectionType | null {
  const trimmed = text.trim().toLowerCase()

  // 이모지가 있을 수도 있고 없을 수도 있음
  if (trimmed.includes('핵심 요약') || trimmed.includes('핵심요약')) return 'summary'
  if (trimmed.includes('상세 내용') || trimmed.includes('상세내용')) return 'detail'
  if (trimmed.includes('추가 참고') || trimmed.includes('추가참고')) return 'tip'
  if (trimmed.includes('관련 법령') || trimmed.includes('관련법령')) return 'related_laws'
  if (trimmed.includes('조건') && trimmed.includes('예외')) return 'conditions'

  return null
}

/**
 * 텍스트에서 상세 내용 하위 섹션 타입 감지
 */
export function detectDetailSubsectionType(text: string): DetailSubsectionType | null {
  const trimmed = text.trim().toLowerCase()

  if (trimmed.includes('조문 발췌') || trimmed.includes('조문발췌') || trimmed.includes('조문 인용')) return 'article_quote'
  if (trimmed.includes('핵심 해석') || trimmed.includes('핵심해석')) return 'interpretation'
  if (trimmed.includes('실무 적용') || trimmed.includes('실무적용')) return 'practice'

  return null
}

/**
 * 섹션 제목에서 이모지 제거
 */
export function removeEmoji(text: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return text.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '').trim()
}

/**
 * 경고 메시지에서 알림 타입 감지
 */
export function detectAlertType(message: string): AlertType {
  if (message.includes('⚠️') || message.toLowerCase().includes('warning')) return 'warning'
  if (message.includes('❌') || message.toLowerCase().includes('error')) return 'error'
  if (message.includes('✅') || message.toLowerCase().includes('success')) return 'success'
  return 'info'
}
