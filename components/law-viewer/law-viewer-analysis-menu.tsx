"use client"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { LawMeta } from "@/lib/law-types"
import type { IconName } from "@/lib/icons"

// ── 분석 도구 타입 ──────────────────────────────────────────
export type AnalysisToolType =
  | 'delegation-gap'
  | 'time-machine'
  | 'impact-tracker'
  | 'ordinance-sync'
  | 'ordinance-benchmark'

interface AnalysisToolMenuItem {
  id: AnalysisToolType
  label: string
  shortLabel: string
  icon: IconName
  description: string
}

// ── 도구 메뉴 정의 ──────────────────────────────────────────
const LAW_TOOLS: AnalysisToolMenuItem[] = [
  {
    id: 'delegation-gap',
    label: '위임 미비 탐지',
    shortLabel: '위임 미비',
    icon: 'file-search',
    description: '위임 조항 vs 하위법령 크로스체크',
  },
  {
    id: 'time-machine',
    label: '법령 타임머신',
    shortLabel: '타임머신',
    icon: 'clock',
    description: '특정 시점의 법령 복원 및 비교',
  },
  {
    id: 'impact-tracker',
    label: '변경 영향 분석',
    shortLabel: '영향 분석',
    icon: 'chart-line',
    description: '개정이 하위법령에 미치는 영향 추적',
  },
]

const ORDINANCE_TOOLS: AnalysisToolMenuItem[] = [
  {
    id: 'ordinance-sync',
    label: '상위법 미반영 탐지',
    shortLabel: '미반영 탐지',
    icon: 'alert-triangle',
    description: '상위법 개정 후 미반영 조항 식별',
  },
  {
    id: 'ordinance-benchmark',
    label: '조례 벤치마킹',
    shortLabel: '벤치마킹',
    icon: 'bar-chart',
    description: '전국 지자체 동일 주제 조례 비교',
  },
]

// ── 도구 활성화 조건 ────────────────────────────────────────
function getAvailableTools(
  meta: LawMeta | undefined,
  isOrdinance: boolean,
  isPrecedent: boolean,
): AnalysisToolMenuItem[] {
  if (isPrecedent || !meta) return []

  const tools: AnalysisToolMenuItem[] = []

  // 위임 미비: 법률(Act)만 — 시행령/시행규칙은 위임 주체가 아님
  const isAct = !isOrdinance && !['시행령', '시행규칙'].includes(meta.lawType || '')
  if (isAct && (meta.mst || meta.lawId)) {
    tools.push(LAW_TOOLS[0]) // delegation-gap
  }

  // 타임머신: 모든 법령 (연혁이 있는 경우)
  if (meta.mst || meta.lawId) {
    tools.push(LAW_TOOLS[1]) // time-machine
  }

  // 영향 추적: 모든 법령/조례
  tools.push(LAW_TOOLS[2]) // impact-tracker

  // 조례 전용
  if (isOrdinance) {
    tools.push(...ORDINANCE_TOOLS)
  }

  return tools
}

// ── Props ───────────────────────────────────────────────────
export interface LawViewerAnalysisMenuProps {
  meta?: LawMeta
  isOrdinance: boolean
  isPrecedent: boolean
  onDelegationGap?: (meta: LawMeta) => void
  onTimeMachine?: (meta: LawMeta) => void
  onImpactTracker?: (lawName: string) => void
  onOrdinanceSync?: (lawName: string) => void
  onOrdinanceBenchmark?: (lawName: string) => void
}

// ── 컴포넌트 ────────────────────────────────────────────────
export function LawViewerAnalysisMenu({
  meta,
  isOrdinance,
  isPrecedent,
  onDelegationGap,
  onTimeMachine,
  onImpactTracker,
  onOrdinanceSync,
  onOrdinanceBenchmark,
}: LawViewerAnalysisMenuProps) {
  const tools = getAvailableTools(meta, isOrdinance, isPrecedent)

  if (tools.length === 0) return null

  const handleSelect = (toolId: AnalysisToolType) => {
    console.log('[AnalysisMenu] handleSelect', { toolId, hasMeta: !!meta, mst: meta?.mst, lawId: meta?.lawId })
    if (!meta) {
      console.warn('[AnalysisMenu] meta 없음 — 동작 중단')
      return
    }

    switch (toolId) {
      case 'delegation-gap':
        console.log('[AnalysisMenu] onDelegationGap 호출', { hasCallback: !!onDelegationGap })
        onDelegationGap?.(meta)
        break
      case 'time-machine':
        onTimeMachine?.(meta)
        break
      case 'impact-tracker':
        onImpactTracker?.(meta.lawTitle)
        break
      case 'ordinance-sync':
        onOrdinanceSync?.(meta.lawTitle)
        break
      case 'ordinance-benchmark':
        onOrdinanceBenchmark?.(meta.lawTitle)
        break
    }
  }

  // 법령 도구와 조례 도구 분리
  const lawTools = tools.filter(t => !['ordinance-sync', 'ordinance-benchmark'].includes(t.id))
  const ordTools = tools.filter(t => ['ordinance-sync', 'ordinance-benchmark'].includes(t.id))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-1.5 sm:px-2 shrink-0">
          <Icon name="bar-chart" size={14} className="sm:mr-1" />
          <span className="hidden sm:inline">분석</span>
          <Icon name="chevron-down" size={12} className="ml-0.5 opacity-60" />
          <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
            {tools.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {lawTools.map((tool) => (
          <DropdownMenuItem
            key={tool.id}
            onClick={() => handleSelect(tool.id)}
            className="flex items-start gap-2.5 py-2 cursor-pointer"
          >
            <Icon name={tool.icon} size={16} className="mt-0.5 shrink-0 text-brand-navy dark:text-brand-gold" />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-sm">{tool.label}</span>
              <span className="text-xs text-muted-foreground leading-tight">{tool.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
        {ordTools.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {ordTools.map((tool) => (
              <DropdownMenuItem
                key={tool.id}
                onClick={() => handleSelect(tool.id)}
                className="flex items-start gap-2.5 py-2 cursor-pointer"
              >
                <Icon name={tool.icon} size={16} className="mt-0.5 shrink-0 text-brand-navy dark:text-brand-gold" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm">{tool.label}</span>
                  <span className="text-xs text-muted-foreground leading-tight">{tool.description}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
