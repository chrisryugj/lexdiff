/**
 * LexDiff 브랜드 마크 — 세리프 L 모노그램 (단일 진실 소스).
 *
 * navy 라운드 + gold L. favicon(app/icon.svg)과 동일 디자인.
 * 헤더·홈·법령뷰·AI뷰 등 모든 브랜드 로고 자리에서 이 컴포넌트만 사용한다.
 * size 지정 시 고정 px, 생략 시 className(h-/w-)으로 크기 제어.
 */
export function BrandMark({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="LexDiff"
      width={size}
      height={size}
      className={className}
    >
      <rect width="100" height="100" rx="24" fill="#0b1c2c" />
      <g fill="#d8944d">
        <path d="M37 27h15v40h-15z" />
        <rect x="30" y="27" width="29" height="4.5" rx="2" />
        <rect x="37" y="62" width="36" height="13" rx="3" />
        <rect x="68" y="57" width="5" height="18" rx="2.5" fill="#9a6500" />
      </g>
    </svg>
  )
}
