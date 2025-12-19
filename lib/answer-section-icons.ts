/**
 * Answer Section Icons
 *
 * AI 답변의 구조화된 섹션에 사용할 아이콘 매핑
 * 이모지 대신 일관된 아이콘 시스템 제공
 */

import { ICON_REGISTRY, type IconType } from '@/lib/icons'

/**
 * AI 답변 섹션 타입 (프롬프트 기반 확장)
 */
export type AnswerSectionType =
  | 'summary'       // 핵심 요약
  | 'detail'        // 상세 내용
  | 'tip'           // 추가 참고
  | 'related_laws'  // 관련 법령
  | 'conditions'    // 조건·예외
  // Definition Expert 섹션
  | 'definition'    // 정의
  | 'legal_nature'  // 법적 성질
  | 'article_text'  // 조문 원문
  | 'interpretation' // 핵심 해석
  | 'components'    // 구성 요건
  | 'comparison'    // 유사 개념 비교
  | 'examples'      // 예시
  // Requirement Expert 섹션
  | 'conclusion'    // 결론
  | 'positive_req'  // 적극적 요건
  | 'negative_req'  // 소극적 요건
  | 'documents'     // 서류/증빙
  | 'exceptions'    // 예외/특례
  | 'caution'       // 주의사항
  // Procedure Expert 섹션
  | 'flow'          // 전체 흐름
  | 'steps'         // 단계별 안내
  | 'timeline'      // 기한 요약표
  | 'remedy'        // 불복/구제 절차
  // Comparison Expert 섹션
  | 'core_diff'     // 핵심 차이
  | 'comparison_table' // 상세 비교표
  | 'features'      // A/B의 특징
  | 'selection'     // 선택 가이드
  | 'practice_tip'  // 실무 팁
  // Application Expert 섹션
  | 'requirement_review' // 요건별 검토
  | 'requirement_summary' // 요건 충족 요약
  | 'additional_check' // 추가 확인 필요 사항
  | 'next_action'   // 다음 행동
  | 'precedent'     // 유사 사례/판례
  // Consequence Expert 섹션
  | 'admin_effect'  // 행정적 효과
  | 'civil_effect'  // 민사적 효과
  | 'criminal_effect' // 형사적 효과
  | 'effect_summary' // 효과 요약표
  | 'cure_method'   // 구제/치유 방법
  // Scope Expert 섹션
  | 'legal_standard' // 법정 기준
  | 'calculation'   // 산정 방법
  | 'adjustment'    // 가산/감경
  | 'calc_example'  // 계산 예시
  | 'deadline_calc' // 기한 계산
  | 'practice_ref'  // 실무 참고
  // Exemption Expert 섹션
  | 'principle_exception' // 원칙 vs 예외 구조
  | 'exemption_req' // 면제/감면 요건
  | 'exemption_scope' // 면제/감면 범위
  | 'application_procedure' // 신청 절차
  | 'post_management' // 사후관리
  | 'similar_exemption' // 유사 면제제도 비교

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
  // 기본 섹션
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
  },

  // Definition Expert 섹션
  definition: {
    icon: ICON_REGISTRY['book-open'],
    label: '정의',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  legal_nature: {
    icon: ICON_REGISTRY['scale'],
    label: '법적 성질',
    iconColor: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800'
  },
  article_text: {
    icon: ICON_REGISTRY['quote'],
    label: '조문 원문',
    iconColor: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-950/20',
    borderColor: 'border-gray-200 dark:border-gray-800'
  },
  interpretation: {
    icon: ICON_REGISTRY['lightbulb'],
    label: '핵심 해석',
    iconColor: 'text-yellow-500 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800'
  },
  components: {
    icon: ICON_REGISTRY['list-checks'],
    label: '구성 요건',
    iconColor: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },
  comparison: {
    icon: ICON_REGISTRY['git-compare'],
    label: '유사 개념 비교',
    iconColor: 'text-teal-500 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-950/20',
    borderColor: 'border-teal-200 dark:border-teal-800'
  },
  examples: {
    icon: ICON_REGISTRY['list-ordered'],
    label: '예시',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },

  // Requirement Expert 섹션
  conclusion: {
    icon: ICON_REGISTRY['check-circle-2'],
    label: '결론',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  positive_req: {
    icon: ICON_REGISTRY['check-circle'],
    label: '적극적 요건',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  negative_req: {
    icon: ICON_REGISTRY['x-circle'],
    label: '소극적 요건',
    iconColor: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    borderColor: 'border-red-200 dark:border-red-800'
  },
  documents: {
    icon: ICON_REGISTRY['file-text'],
    label: '서류/증빙',
    iconColor: 'text-slate-500 dark:text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-950/20',
    borderColor: 'border-slate-200 dark:border-slate-800'
  },
  exceptions: {
    icon: ICON_REGISTRY['alert-triangle'],
    label: '예외/특례',
    iconColor: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800'
  },
  caution: {
    icon: ICON_REGISTRY['alert-circle'],
    label: '주의사항',
    iconColor: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },

  // Procedure Expert 섹션
  flow: {
    icon: ICON_REGISTRY['arrow-right'],
    label: '전체 흐름',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  steps: {
    icon: ICON_REGISTRY['list-ordered'],
    label: '단계별 안내',
    iconColor: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800'
  },
  timeline: {
    icon: ICON_REGISTRY['clock'],
    label: '기한 요약표',
    iconColor: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800'
  },
  remedy: {
    icon: ICON_REGISTRY['shield-check'],
    label: '불복/구제 절차',
    iconColor: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },

  // Comparison Expert 섹션
  core_diff: {
    icon: ICON_REGISTRY['git-compare'],
    label: '핵심 차이',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  comparison_table: {
    icon: ICON_REGISTRY['list-checks'],
    label: '상세 비교표',
    iconColor: 'text-teal-500 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-950/20',
    borderColor: 'border-teal-200 dark:border-teal-800'
  },
  features: {
    icon: ICON_REGISTRY['star'],
    label: '특징',
    iconColor: 'text-yellow-500 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800'
  },
  selection: {
    icon: ICON_REGISTRY['check-circle-2'],
    label: '선택 가이드',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  practice_tip: {
    icon: ICON_REGISTRY['lightbulb'],
    label: '실무 팁',
    iconColor: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },

  // Application Expert 섹션
  requirement_review: {
    icon: ICON_REGISTRY['list-checks'],
    label: '요건별 검토',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  requirement_summary: {
    icon: ICON_REGISTRY['clipboard-check'],
    label: '요건 충족 요약',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  additional_check: {
    icon: ICON_REGISTRY['help-circle'],
    label: '추가 확인 필요',
    iconColor: 'text-yellow-500 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800'
  },
  next_action: {
    icon: ICON_REGISTRY['arrow-right'],
    label: '다음 행동',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  precedent: {
    icon: ICON_REGISTRY['gavel'],
    label: '유사 사례/판례',
    iconColor: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },

  // Consequence Expert 섹션
  admin_effect: {
    icon: ICON_REGISTRY['building'],
    label: '행정적 효과',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  civil_effect: {
    icon: ICON_REGISTRY['scale'],
    label: '민사적 효과',
    iconColor: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800'
  },
  criminal_effect: {
    icon: ICON_REGISTRY['gavel'],
    label: '형사적 효과',
    iconColor: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    borderColor: 'border-red-200 dark:border-red-800'
  },
  effect_summary: {
    icon: ICON_REGISTRY['list-checks'],
    label: '효과 요약표',
    iconColor: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-950/20',
    borderColor: 'border-gray-200 dark:border-gray-800'
  },
  cure_method: {
    icon: ICON_REGISTRY['shield-check'],
    label: '구제/치유 방법',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },

  // Scope Expert 섹션
  legal_standard: {
    icon: ICON_REGISTRY['ruler'],
    label: '법정 기준',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  calculation: {
    icon: ICON_REGISTRY['calculator'],
    label: '산정 방법',
    iconColor: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800'
  },
  adjustment: {
    icon: ICON_REGISTRY['trending-up'],
    label: '가산/감경',
    iconColor: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800'
  },
  calc_example: {
    icon: ICON_REGISTRY['list-ordered'],
    label: '계산 예시',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  deadline_calc: {
    icon: ICON_REGISTRY['calendar'],
    label: '기한 계산',
    iconColor: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },
  practice_ref: {
    icon: ICON_REGISTRY['bookmark'],
    label: '실무 참고',
    iconColor: 'text-teal-500 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-950/20',
    borderColor: 'border-teal-200 dark:border-teal-800'
  },

  // Exemption Expert 섹션
  principle_exception: {
    icon: ICON_REGISTRY['git-compare'],
    label: '원칙 vs 예외',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  exemption_req: {
    icon: ICON_REGISTRY['list-checks'],
    label: '면제/감면 요건',
    iconColor: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  exemption_scope: {
    icon: ICON_REGISTRY['coins'],
    label: '면제/감면 범위',
    iconColor: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  application_procedure: {
    icon: ICON_REGISTRY['file-text'],
    label: '신청 절차',
    iconColor: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800'
  },
  post_management: {
    icon: ICON_REGISTRY['clock'],
    label: '사후관리',
    iconColor: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800'
  },
  similar_exemption: {
    icon: ICON_REGISTRY['git-compare'],
    label: '유사 면제제도 비교',
    iconColor: 'text-teal-500 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-950/20',
    borderColor: 'border-teal-200 dark:border-teal-800'
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
 * 텍스트에서 섹션 타입 자동 감지 (프롬프트 기반 확장)
 */
export function detectSectionType(text: string): AnswerSectionType | null {
  const trimmed = text.trim().toLowerCase()

  // 기본 섹션
  if (trimmed.includes('핵심 요약') || trimmed.includes('핵심요약')) return 'summary'
  if (trimmed.includes('상세 내용') || trimmed.includes('상세내용')) return 'detail'
  if (trimmed.includes('추가 참고') || trimmed.includes('추가참고')) return 'tip'
  if (trimmed.includes('관계 법령') || trimmed.includes('관련 법령') || trimmed.includes('관련법령')) return 'related_laws'

  // Definition Expert 섹션
  if (trimmed === '정의' || trimmed.endsWith(' 정의')) return 'definition'
  if (trimmed.includes('법적 성질') || trimmed.includes('법적성질')) return 'legal_nature'
  if (trimmed.includes('조문 원문') || trimmed.includes('조문원문')) return 'article_text'
  if (trimmed.includes('핵심 해석') || trimmed.includes('핵심해석')) return 'interpretation'
  if (trimmed.includes('구성 요건') || trimmed.includes('구성요건')) return 'components'
  if (trimmed.includes('유사 개념 비교') || trimmed.includes('개념 비교')) return 'comparison'
  if (trimmed === '예시' || trimmed.endsWith(' 예시')) return 'examples'

  // Requirement Expert 섹션
  if (trimmed === '결론' || trimmed.endsWith(' 결론') || trimmed.includes('핵심 효과')) return 'conclusion'
  if (trimmed.includes('적극적 요건') || trimmed.includes('충족해야')) return 'positive_req'
  if (trimmed.includes('소극적 요건') || trimmed.includes('결격사유') || trimmed.includes('결격 사유')) return 'negative_req'
  if (trimmed.includes('서류') || trimmed.includes('증빙')) return 'documents'
  if (trimmed.includes('예외') || trimmed.includes('특례')) return 'exceptions'
  if (trimmed.includes('주의사항') || trimmed.includes('주의 사항')) return 'caution'

  // Procedure Expert 섹션
  if (trimmed.includes('전체 흐름') || trimmed.includes('전체흐름')) return 'flow'
  if (trimmed.includes('단계별 안내') || trimmed.includes('단계별안내')) return 'steps'
  if (trimmed.includes('기한 요약') || trimmed.includes('기한요약')) return 'timeline'
  if (trimmed.includes('불복') || trimmed.includes('구제 절차') || trimmed.includes('구제절차')) return 'remedy'

  // Comparison Expert 섹션
  if (trimmed.includes('핵심 차이') || trimmed.includes('핵심차이')) return 'core_diff'
  if (trimmed.includes('상세 비교') || trimmed.includes('비교표')) return 'comparison_table'
  if (trimmed.includes('의 특징') || trimmed.includes('특징')) return 'features'
  if (trimmed.includes('선택 가이드') || trimmed.includes('선택가이드')) return 'selection'
  if (trimmed.includes('실무 팁') || trimmed.includes('실무팁')) return 'practice_tip'

  // Application Expert 섹션
  if (trimmed.includes('요건별 검토') || trimmed.includes('요건별검토')) return 'requirement_review'
  if (trimmed.includes('요건 충족 요약') || trimmed.includes('충족 요약')) return 'requirement_summary'
  if (trimmed.includes('추가 확인') || trimmed.includes('확인 필요')) return 'additional_check'
  if (trimmed.includes('다음 행동') || trimmed.includes('다음행동')) return 'next_action'
  if (trimmed.includes('유사 사례') || trimmed.includes('판례')) return 'precedent'

  // Consequence Expert 섹션
  if (trimmed.includes('행정적 효과') || trimmed.includes('행정적효과')) return 'admin_effect'
  if (trimmed.includes('민사적 효과') || trimmed.includes('민사적효과')) return 'civil_effect'
  if (trimmed.includes('형사적 효과') || trimmed.includes('형사적효과')) return 'criminal_effect'
  if (trimmed.includes('효과 요약') || trimmed.includes('효과요약')) return 'effect_summary'
  if (trimmed.includes('구제') || trimmed.includes('치유 방법') || trimmed.includes('치유방법')) return 'cure_method'

  // Scope Expert 섹션
  if (trimmed.includes('법정 기준') || trimmed.includes('법정기준')) return 'legal_standard'
  if (trimmed.includes('산정 방법') || trimmed.includes('산정방법')) return 'calculation'
  if (trimmed.includes('가산') || trimmed.includes('감경')) return 'adjustment'
  if (trimmed.includes('계산 예시') || trimmed.includes('계산예시')) return 'calc_example'
  if (trimmed.includes('기한 계산') || trimmed.includes('기한계산')) return 'deadline_calc'
  if (trimmed.includes('실무 참고') || trimmed.includes('실무참고')) return 'practice_ref'

  // Exemption Expert 섹션
  if (trimmed.includes('원칙') && trimmed.includes('예외')) return 'principle_exception'
  if (trimmed.includes('면제') && trimmed.includes('요건')) return 'exemption_req'
  if (trimmed.includes('면제') && trimmed.includes('범위')) return 'exemption_scope'
  if (trimmed.includes('신청 절차') || trimmed.includes('신청절차')) return 'application_procedure'
  if (trimmed.includes('사후관리') || trimmed.includes('사후 관리')) return 'post_management'
  if (trimmed.includes('유사 면제') || trimmed.includes('면제제도 비교')) return 'similar_exemption'

  // 조건·예외 (마지막에 체크 - 다른 패턴에 먼저 매칭되도록)
  if (trimmed.includes('조건') && trimmed.includes('예외')) return 'conditions'

  return null
}

/**
 * 텍스트에서 상세 내용 하위 섹션 타입 감지
 */
export function detectDetailSubsectionType(text: string): DetailSubsectionType | null {
  const trimmed = text.trim().toLowerCase()

  // 조문 발췌 패턴
  if (trimmed.includes('조문 발췌') || trimmed.includes('조문발췌') || trimmed.includes('조문 인용') ||
      trimmed.includes('관련 조문') || trimmed.includes('참조 조문') || trimmed.includes('원문')) return 'article_quote'

  // 핵심 해석 패턴
  if (trimmed.includes('핵심 해석') || trimmed.includes('핵심해석') ||
      trimmed.includes('법적 해석') || trimmed.includes('해석') ||
      trimmed.includes('의미') || trimmed.includes('취지')) return 'interpretation'

  // 실무 적용 패턴
  if (trimmed.includes('실무 적용') || trimmed.includes('실무적용') ||
      trimmed.includes('적용 방법') || trimmed.includes('활용') ||
      trimmed.includes('사례') || trimmed.includes('예시')) return 'practice'

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
