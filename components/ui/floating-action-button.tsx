"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface FloatingActionButtonProps {
  onClick: () => void
  icon: ReactNode
  count?: number
  className?: string
  label?: string
}

export function FloatingActionButton({
  onClick,
  icon,
  count,
  className,
  label,
}: FloatingActionButtonProps) {
  const hasCount = count !== undefined && count > 0
  const displayCount = count && count > 999 ? "999+" : count

  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-30 shadow-2xl lg:hidden",
        "bg-primary hover:bg-primary/90 text-primary-foreground",
        "transition-all duration-300 hover:scale-105 active:scale-95",
        "flex items-center justify-center gap-2",
        "font-semibold text-sm",
        // Pill shape when count exists, circular otherwise
        hasCount
          ? "rounded-full h-12 px-4 min-w-[3rem]"
          : "rounded-full h-14 w-14",
        className
      )}
      aria-label={label}
    >
      {icon}
      {hasCount && (
        <span className="text-primary-foreground font-bold">
          {displayCount}
        </span>
      )}
    </button>
  )
}
