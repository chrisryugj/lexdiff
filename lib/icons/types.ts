/**
 * 아이콘 타입 정의
 */
import type { IconName, IconType } from './index'

/**
 * 기존 LucideIcon 타입 호환을 위한 별칭
 * 마이그레이션 중 `type LucideIcon` 대신 사용
 */
export type { IconType as LucideIcon }
export type { IconName, IconType }

/**
 * 아이콘 Props 전달용 인터페이스
 */
export interface IconProp {
  icon: IconType
}

/**
 * 매핑 테이블 엔트리 타입
 */
export interface IconMapEntry {
  pattern: RegExp
  icon: IconType
}

/**
 * 상태별 설정 타입 (search-progress.tsx 등에서 사용)
 */
export interface StageIconConfig {
  label: string
  icon: IconType
  progress: number
}
