/**
 * shared/truncation-tooltip.tsx
 *
 * 텍스트 잘림 시 마우스를 따라다니는 툴팁 UI.
 * useTruncationTooltip 훅과 함께 사용.
 */

"use client"

interface TruncationTooltipProps {
  show: boolean
  position: { x: number; y: number }
  text: string
}

export function TruncationTooltip({ show, position, text }: TruncationTooltipProps) {
  if (!show) return null

  return (
    <div
      className="fixed z-[9999] max-w-xs p-2 bg-popover/95 backdrop-blur border border-border rounded-lg shadow-2xl pointer-events-none"
      style={{
        fontFamily: "Pretendard, sans-serif",
        left: `${position.x + 12}px`,
        top: `${position.y + 16}px`,
      }}
    >
      <p className="text-xs text-popover-foreground line-clamp-2 break-words">
        {text}
      </p>
    </div>
  )
}
