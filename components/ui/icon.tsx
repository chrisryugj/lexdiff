'use client'

/**
 * 공통 아이콘 컴포넌트
 *
 * 아이콘 라이브러리 추상화 레이어
 * - name prop으로 문자열 기반 아이콘 지정
 * - className의 Tailwind 크기 → size prop 자동 변환
 * - 향후 라이브러리 교체 시 이 파일만 수정
 */
import { forwardRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ICON_REGISTRY, type IconName, type IconType } from '@/lib/icons'
import { cn } from '@/lib/utils'

// Tailwind 크기 → 픽셀 변환 테이블
const SIZE_MAP: Record<string, number> = {
  'h-3 w-3': 12,
  'size-3': 12,
  'h-3.5 w-3.5': 14,
  'size-3.5': 14,
  'h-4 w-4': 16,
  'size-4': 16,
  'h-5 w-5': 20,
  'size-5': 20,
  'h-6 w-6': 24,
  'size-6': 24,
  'h-8 w-8': 32,
  'size-8': 32,
  'h-10 w-10': 40,
  'size-10': 40,
  'h-12 w-12': 48,
  'size-12': 48,
  'h-16 w-16': 64,
  'size-16': 64,
}

/**
 * className에서 크기 추출
 */
function extractSize(className: string): number | undefined {
  for (const [pattern, size] of Object.entries(SIZE_MAP)) {
    if (className.includes(pattern)) {
      return size
    }
  }
  // h-X w-X 패턴 동적 추출
  const match = className.match(/(?:^|\s)h-(\d+(?:\.\d+)?)\s+w-\1(?:\s|$)/)
  if (match) {
    return Math.round(parseFloat(match[1]) * 4)
  }
  // size-X 패턴 동적 추출
  const sizeMatch = className.match(/(?:^|\s)size-(\d+(?:\.\d+)?)(?:\s|$)/)
  if (sizeMatch) {
    return Math.round(parseFloat(sizeMatch[1]) * 4)
  }
  return undefined
}

/**
 * className에서 크기 관련 클래스 제거
 */
function removeSizeClasses(className: string): string {
  return className
    .replace(/\bh-\d+(?:\.\d+)?\s*/g, '')
    .replace(/\bw-\d+(?:\.\d+)?\s*/g, '')
    .replace(/\bsize-\d+(?:\.\d+)?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface IconProps {
  /** 아이콘 이름 (kebab-case) */
  name: IconName
  /** 픽셀 크기 (기본: 16) */
  size?: number
  /** 추가 CSS 클래스 (animate-spin, text-* 등) */
  className?: string
  /** 색상 (기본: currentColor) */
  color?: string
  /** 선 굵기 */
  strokeWidth?: number
}

/**
 * Icon 컴포넌트 - 문자열 name으로 아이콘 렌더링
 *
 * @example
 * // 기본 사용
 * <Icon name="search" size={16} />
 *
 * // Tailwind className 호환 (크기 자동 변환)
 * <Icon name="loader" className="h-4 w-4 animate-spin" />
 *
 * // 색상 지정
 * <Icon name="star" size={20} className="text-yellow-500" />
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ name, size, className = '', color, strokeWidth, ...props }, ref) => {
    const IconComponent = ICON_REGISTRY[name]

    if (!IconComponent) {
      console.warn(`[Icon] Unknown icon name: "${name}"`)
      return null
    }

    // className에서 크기 추출 (size prop이 없을 때만)
    const extractedSize = size ?? extractSize(className) ?? 16
    const remainingClasses = removeSizeClasses(className)

    return (
      <HugeiconsIcon
        ref={ref}
        icon={IconComponent}
        size={extractedSize}
        color={color ?? 'currentColor'}
        strokeWidth={strokeWidth}
        className={cn(remainingClasses)}
        {...props}
      />
    )
  }
)

Icon.displayName = 'Icon'

export interface DynamicIconProps {
  /** 아이콘 컴포넌트 참조 */
  icon: IconType
  /** 픽셀 크기 (기본: 16) */
  size?: number
  /** 추가 CSS 클래스 */
  className?: string
  /** 색상 (기본: currentColor) */
  color?: string
  /** 선 굵기 */
  strokeWidth?: number
}

/**
 * DynamicIcon 컴포넌트 - 동적 아이콘 렌더링
 * 매핑 테이블이나 props로 전달받은 아이콘용
 *
 * @example
 * // 매핑 테이블에서 사용
 * const stages = { searching: { icon: ICON_REGISTRY.search } }
 * <DynamicIcon icon={stages.searching.icon} size={20} />
 *
 * // Props로 전달받은 아이콘
 * function Card({ icon }: { icon: IconType }) {
 *   return <DynamicIcon icon={icon} size={24} />
 * }
 */
export const DynamicIcon = forwardRef<SVGSVGElement, DynamicIconProps>(
  ({ icon, size, className = '', color, strokeWidth, ...props }, ref) => {
    // className에서 크기 추출
    const extractedSize = size ?? extractSize(className) ?? 16
    const remainingClasses = removeSizeClasses(className)

    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        size={extractedSize}
        color={color ?? 'currentColor'}
        strokeWidth={strokeWidth}
        className={cn(remainingClasses)}
        {...props}
      />
    )
  }
)

DynamicIcon.displayName = 'DynamicIcon'

// Re-export for convenience
export { ICON_REGISTRY, type IconName, type IconType }
