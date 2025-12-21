"use client"

import { cn } from "@/lib/utils"

interface BorderBeamProps {
  duration?: number
  size?: number
  colorFrom?: string
  colorTo?: string
  reverse?: boolean
  className?: string
}

export const BorderBeam = ({
  duration = 4,
  size = 100,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  reverse = false,
  className,
}: BorderBeamProps) => {
  return (
    <>
      <style jsx>{`
        @keyframes border-beam {
          0% {
            background-position: 0% 0%;
          }
          100% {
            background-position: 200% 200%;
          }
        }
      `}</style>
      <div
        className={cn("absolute inset-0 pointer-events-none rounded-[inherit]", className)}
        style={{
          background: `linear-gradient(90deg, transparent 0%, transparent 40%, ${colorFrom} 50%, ${colorTo} 60%, transparent 70%, transparent 100%)`,
          backgroundSize: "200% 200%",
          animation: `border-beam ${duration}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
          maskImage: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
          WebkitMaskImage: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          padding: "2px",
        }}
      />
    </>
  )
}
