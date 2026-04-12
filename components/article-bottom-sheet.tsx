"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface ArticleBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  snapPoints?: number[] // Heights in vh units [peek, half, full]
}

export function ArticleBottomSheet({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = [30, 60, 90], // Default snap points: 30vh, 60vh, 90vh
}: ArticleBottomSheetProps) {
  const [snapIndex, setSnapIndex] = useState(0) // Start at peek (30vh)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [currentHeight, setCurrentHeight] = useState(snapPoints[0])
  const sheetRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setSnapIndex(0)
      setCurrentHeight(snapPoints[0])
    }
  }, [isOpen, snapPoints])

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    setStartY(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return

    const currentY = e.touches[0].clientY
    const deltaY = startY - currentY
    const vh = window.innerHeight / 100
    const newHeightVh = currentHeight + deltaY / vh

    // Constrain between min and max snap points
    const constrainedHeight = Math.max(
      snapPoints[0],
      Math.min(snapPoints[snapPoints.length - 1], newHeightVh)
    )

    setCurrentHeight(constrainedHeight)
  }

  const handleTouchEnd = () => {
    setIsDragging(false)

    // Find closest snap point
    let closestSnapIndex = 0
    let minDiff = Math.abs(currentHeight - snapPoints[0])

    snapPoints.forEach((snap, index) => {
      const diff = Math.abs(currentHeight - snap)
      if (diff < minDiff) {
        minDiff = diff
        closestSnapIndex = index
      }
    })

    // If dragged below first snap point significantly, close
    if (currentHeight < snapPoints[0] - 5) {
      onClose()
      return
    }

    setSnapIndex(closestSnapIndex)
    setCurrentHeight(snapPoints[closestSnapIndex])
    setStartY(0)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartY(e.clientY)
  }

  // PERF-11: 핸들러를 effect 내부로 이동 + ref로 stale state 방지
  // 매 render마다 새 함수가 만들어지면 removeEventListener가 다른 참조를 제거하여 listener 누적
  const dragStateRef = useRef({ startY: 0, currentHeight: snapPoints[0] })
  useEffect(() => {
    dragStateRef.current = { startY, currentHeight }
  }, [startY, currentHeight])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const { startY: sy, currentHeight: ch } = dragStateRef.current
      const currentY = e.clientY
      const deltaY = sy - currentY
      const vh = window.innerHeight / 100
      const newHeightVh = ch + deltaY / vh

      const constrainedHeight = Math.max(
        snapPoints[0],
        Math.min(snapPoints[snapPoints.length - 1], newHeightVh)
      )

      setCurrentHeight(constrainedHeight)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      const ch = dragStateRef.current.currentHeight

      let closestSnapIndex = 0
      let minDiff = Math.abs(ch - snapPoints[0])
      snapPoints.forEach((snap, index) => {
        const diff = Math.abs(ch - snap)
        if (diff < minDiff) {
          minDiff = diff
          closestSnapIndex = index
        }
      })

      if (ch < snapPoints[0] - 5) {
        onClose()
        return
      }

      setSnapIndex(closestSnapIndex)
      setCurrentHeight(snapPoints[closestSnapIndex])
      setStartY(0)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, snapPoints, onClose])

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  if (!mounted) return null

  const sheetContent = (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
        />
      )}

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full",
          isDragging && "transition-none"
        )}
        style={{
          height: `${currentHeight}vh`,
          maxHeight: "90vh",
        }}
      >
        {/* Drag Handle Area */}
        <div
          className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          {/* Drag Handle */}
          <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mb-2" />

          {/* Header */}
          {title && (
            <div className="w-full px-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{title}</h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="shrink-0"
              >
                <Icon name="x" className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Content - Only render when open */}
        {isOpen && (
          <div className="h-[calc(100%-4rem)] overflow-y-auto px-4 pb-4">
            {children}
          </div>
        )}
      </div>
    </>
  )

  return createPortal(sheetContent, document.body)
}
