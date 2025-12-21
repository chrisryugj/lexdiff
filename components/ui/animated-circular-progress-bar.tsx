import { cn } from "@/lib/utils"
import { NumberTicker } from "@/components/ui/number-ticker"
import { useState, useEffect, useRef } from "react"

interface AnimatedCircularProgressBarProps {
  max?: number
  min?: number
  value: number
  gaugePrimaryColor: string
  gaugeSecondaryColor: string
  className?: string
}

export function AnimatedCircularProgressBar({
  max = 100,
  min = 0,
  value = 0,
  gaugePrimaryColor,
  gaugeSecondaryColor,
  className,
}: AnimatedCircularProgressBarProps) {
  const circumference = 2 * Math.PI * 45
  const percentPx = circumference / 100
  const targetPercent = Math.round(((value - min) / (max - min)) * 100)

  // 부드럽게 증가하는 진행률
  const [currentPercent, setCurrentPercent] = useState(0)
  const previousTargetRef = useRef(0)

  useEffect(() => {
    const startPercent = previousTargetRef.current

    // 목표값이 현재보다 작으면 즉시 설정 (뒤로 가는 경우)
    if (targetPercent < startPercent) {
      setCurrentPercent(targetPercent)
      previousTargetRef.current = targetPercent
      return
    }

    // 같으면 아무것도 안 함
    if (targetPercent === startPercent) {
      return
    }

    // 부드럽게 증가
    const startTime = Date.now()
    const duration = 800
    const delta = targetPercent - startPercent

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // easeOutQuad 이징
      const eased = 1 - (1 - progress) * (1 - progress)
      const current = Math.round(startPercent + delta * eased)

      setCurrentPercent(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        previousTargetRef.current = targetPercent
      }
    }

    requestAnimationFrame(animate)
  }, [targetPercent])

  return (
    <div
      className={cn("relative size-40", className)}
      style={
        {
          "--circle-size": "100px",
          "--circumference": circumference,
          "--percent-to-px": `${percentPx}px`,
          "--gap-percent": "5",
          "--offset-factor": "0",
          "--transition-length": "1s",
          "--transition-step": "200ms",
          "--delay": "0s",
          "--percent-to-deg": "3.6deg",
          transform: "translateZ(0)",
        } as React.CSSProperties
      }
    >
      <svg
        fill="none"
        className="size-full"
        strokeWidth="2"
        viewBox="0 0 100 100"
      >
        {currentPercent <= 90 && currentPercent >= 0 && (
          <circle
            cx="50"
            cy="50"
            r="45"
            strokeWidth="10"
            strokeDashoffset="0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-100"
            style={
              {
                stroke: gaugeSecondaryColor,
                "--stroke-percent": 90 - currentPercent,
                "--offset-factor-secondary": "calc(1 - var(--offset-factor))",
                strokeDasharray:
                  "calc(var(--stroke-percent) * var(--percent-to-px)) var(--circumference)",
                transform:
                  "rotate(calc(1turn - 90deg - (var(--gap-percent) * var(--percent-to-deg) * var(--offset-factor-secondary)))) scaleY(-1)",
                transition: "all var(--transition-length) ease var(--delay)",
                transformOrigin:
                  "calc(var(--circle-size) / 2) calc(var(--circle-size) / 2)",
              } as React.CSSProperties
            }
          />
        )}
        <circle
          cx="50"
          cy="50"
          r="45"
          strokeWidth="10"
          strokeDashoffset="0"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-100"
          style={
            {
              stroke: gaugePrimaryColor,
              "--stroke-percent": currentPercent,
              strokeDasharray:
                "calc(var(--stroke-percent) * var(--percent-to-px)) var(--circumference)",
              transition:
                "var(--transition-length) ease var(--delay),stroke var(--transition-length) ease var(--delay)",
              transitionProperty: "stroke-dasharray,transform",
              transform:
                "rotate(calc(-90deg + var(--gap-percent) * var(--offset-factor) * var(--percent-to-deg)))",
              transformOrigin:
                "calc(var(--circle-size) / 2) calc(var(--circle-size) / 2)",
            } as React.CSSProperties
          }
        />
      </svg>
      <span
        data-current-value={currentPercent}
        className="animate-in fade-in absolute inset-0 m-auto size-fit text-5xl font-bold tabular-nums delay-[var(--delay)] duration-[var(--transition-length)] ease-linear animate-shimmer bg-gradient-to-r from-white via-gray-100 to-white bg-[length:200%_100%] bg-clip-text text-transparent"
      >
        <NumberTicker value={currentPercent} />
      </span>
    </div>
  )
}
