"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface FloatingActionButtonProps {
  onClick: () => void
  icon: ReactNode
  badge?: number
  className?: string
  label?: string
}

export function FloatingActionButton({
  onClick,
  icon,
  badge,
  className,
  label,
}: FloatingActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="icon-lg"
      className={cn(
        "fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full shadow-2xl lg:hidden",
        "bg-primary hover:bg-primary/90 text-primary-foreground",
        "transition-all duration-200 hover:scale-110 active:scale-95",
        className
      )}
      aria-label={label}
    >
      <div className="relative flex items-center justify-center">
        {icon}
        {badge !== undefined && badge > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 min-w-5 px-1 text-xs font-bold"
          >
            {badge > 99 ? "99+" : badge}
          </Badge>
        )}
      </div>
    </Button>
  )
}
