import React from 'react'
import { Icon } from '@/components/ui/icon'

interface FlowStep {
  id: string
  label: string
}

interface FlowEdge {
  from: string
  to: string
}

/**
 * 간단한 플로우차트 렌더러 (Mini-Mermaid)
 * Mermaid 코드를 파싱하여 수평 플로우로 렌더링
 */
export function SimpleFlowchartRenderer({ code }: { code: string }) {
  // Parse format: A[Label] --> B[Label] or A --> B
  const steps: FlowStep[] = []
  const edges: FlowEdge[] = []

  // Very naive parser for simple linear flows (sufficient for most legal procedures)
  const lines = code.split('\n')

  // Extract Nodes and Edges from lines
  lines.forEach(line => {
    // Split by arrow
    if (line.includes('-->')) {
      const parts = line.split('-->')
      let prevId: string | null = null

      parts.forEach(part => {
        const match = /([A-Za-z0-9_]+)(?:\[(.*?)\])?/.exec(part.trim())
        if (match) {
          const id = match[1]
          const label = match[2] || id

          // Add node if unique
          if (!steps.find(s => s.id === id)) {
            steps.push({ id, label })
          }

          if (prevId) {
            edges.push({ from: prevId, to: id })
          }
          prevId = id
        }
      })
    }
  })

  if (steps.length === 0) {
    // Fallback: If parsing fails, just show text blocks
    return (
      <div className="bg-muted/30 p-4 rounded-md my-4 border border-border/50">
        <p className="text-xs text-muted-foreground mb-2 font-mono">다이어그램 (텍스트 모드)</p>
        <pre className="text-xs">{code}</pre>
      </div>
    )
  }

  // Render as a horizontal Flex row (Linear flow assumption)
  return (
    <div className="flex flex-wrap items-center gap-2 my-6 p-4 bg-muted/10 border border-border/50 rounded-lg overflow-x-auto justify-center">
      {steps.map((step, idx) => (
        <React.Fragment key={step.id}>
          {/* Node */}
          <div className="flex flex-col items-center gap-2 min-w-[100px]">
            <div className="bg-white dark:bg-card border border-blue-200 dark:border-blue-900 shadow-sm px-4 py-3 rounded-xl flex items-center justify-center text-center">
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-100 break-keep leading-tight">
                {step.label.replace(/["']/g, '')}
              </span>
            </div>
          </div>

          {/* Arrow (if not last) */}
          {idx < steps.length - 1 && (
            <div className="text-muted-foreground/40 flex-shrink-0">
              <Icon name="arrow-right" className="w-5 h-5" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
