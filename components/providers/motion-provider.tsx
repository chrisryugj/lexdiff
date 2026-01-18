'use client'

import { LazyMotion, domAnimation } from 'framer-motion'

/**
 * LazyMotion Provider - 번들 크기 ~60% 감소
 * - domAnimation: 기본 애니메이션 기능만 포함 (~17KB vs ~50KB)
 * - m 컴포넌트 사용 필수 (motion 대신)
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>
}
