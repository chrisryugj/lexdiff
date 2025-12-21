"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { flushSync } from "react-dom"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  // 클라이언트에서만 렌더링 (hydration mismatch 방지)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = React.useCallback(() => {
    if (!buttonRef.current) return

    const newTheme = theme === "dark" ? "light" : "dark"

    // View Transition API 지원 확인
    if (!document.startViewTransition) {
      setTheme(newTheme)
      return
    }

    document.startViewTransition(() => {
      flushSync(() => {
        setTheme(newTheme)
      })
    }).ready.then(() => {
      if (!buttonRef.current) return

      const { top, left, width, height } =
        buttonRef.current.getBoundingClientRect()
      const x = left + width / 2
      const y = top + height / 2
      const maxRadius = Math.hypot(
        Math.max(left, window.innerWidth - left),
        Math.max(top, window.innerHeight - top)
      )

      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 400,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    })
  }, [theme, setTheme])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <Icon name="sun" className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={toggleTheme}
      title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {theme === "dark" ? (
        <Icon name="sun" className="h-4 w-4" />
      ) : (
        <Icon name="moon" className="h-4 w-4" />
      )}
    </Button>
  )
}
