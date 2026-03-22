"use client"

import { Button } from "@/components/ui/button"
import { Icon, type IconName } from "@/components/ui/icon"
import { Badge } from "@/components/ui/badge"
import { useImpactAnalysis } from "@/hooks/use-impact-analysis"
import type { ImpactItem, ImpactResult } from "@/lib/relation-graph/impact-analysis"
import type { RelationType } from "@/lib/relation-graph/relation-types"
import { RELATION_LABELS } from "@/lib/relation-graph/relation-types"

interface ImpactAnalysisPanelProps {
  lawId: string | undefined
  jo?: string
  lawTitle?: string
  onNavigate?: (lawId: string, article?: string) => void
  onClose?: () => void
}

const SECTION_CONFIG: { key: keyof Pick<ImpactResult, 'downstream' | 'upstream' | 'lateral' | 'precedents'>; label: string; icon: IconName; desc: string }[] = [
  { key: 'downstream', label: '하향 영향', icon: 'arrow-down', desc: '위임받은 하위법령' },
  { key: 'upstream', label: '상향 영향', icon: 'arrow-up', desc: '근거 법률' },
  { key: 'lateral', label: '횡단 참조', icon: 'arrow-left-right', desc: '같은 법 내 인용' },
  { key: 'precedents', label: '판례', icon: 'scale', desc: '해석 판례' },
]

export function ImpactAnalysisPanel({
  lawId, jo, lawTitle, onNavigate, onClose,
}: ImpactAnalysisPanelProps) {
  const { data, isLoading, error, fetch: fetchImpact } = useImpactAnalysis(lawId, jo)

  // 첫 렌더 시 자동 fetch하지 않음 — 버튼 클릭으로 트리거
  const hasData = data !== null

  return (
    <div className="border-t border-border bg-muted/30">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Icon name="chart-line" size={16} className="text-brand-gold" />
          <span className="text-sm font-medium">
            영향 분석{lawTitle ? `: ${lawTitle}` : ''}
            {jo ? ` ${formatJo(jo)}` : ''}
          </span>
          {data && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {data.stats.total}건
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={fetchImpact}
            disabled={isLoading || !lawId}
          >
            {isLoading ? (
              <Icon name="loader" size={14} className="animate-spin" />
            ) : (
              <Icon name="refresh-cw" size={14} />
            )}
            <span className="ml-1 text-xs">{hasData ? '새로고침' : '분석'}</span>
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
              <Icon name="x" size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="px-3 py-2 max-h-[400px] overflow-y-auto">
        {error && (
          <div className="text-sm text-destructive py-2">{error}</div>
        )}

        {!hasData && !isLoading && !error && (
          <div className="text-sm text-muted-foreground py-4 text-center">
            &ldquo;분석&rdquo; 버튼을 눌러 이 조문의 영향 범위를 확인하세요.
            <br />
            <span className="text-xs">위임법령, 판례를 먼저 조회하면 더 풍부한 결과가 나옵니다.</span>
          </div>
        )}

        {hasData && data.stats.total === 0 && (
          <div className="text-sm text-muted-foreground py-4 text-center">
            아직 분석할 관계가 없습니다.
            <br />
            <span className="text-xs">위임법령 조회 후 다시 시도하세요.</span>
          </div>
        )}

        {hasData && data.stats.total > 0 && (
          <div className="space-y-3">
            {SECTION_CONFIG.map(({ key, label, icon, desc }) => {
              const items = data[key] as ImpactItem[]
              if (items.length === 0) return null

              return (
                <ImpactSection
                  key={key}
                  label={label}
                  icon={icon}
                  desc={desc}
                  items={items}
                  onNavigate={onNavigate}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 섹션 컴포넌트 ────────────────────────────────────

function ImpactSection({
  label, icon, desc, items, onNavigate,
}: {
  label: string
  icon: IconName
  desc: string
  items: ImpactItem[]
  onNavigate?: (lawId: string, article?: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name={icon} size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium">{label}</span>
        <Badge variant="outline" className="h-4 px-1 text-[10px]">{items.length}</Badge>
        <span className="text-[10px] text-muted-foreground">{desc}</span>
      </div>
      <div className="ml-4 space-y-0.5">
        {items.map((item, i) => (
          <ImpactItemRow key={`${item.nodeId}-${item.article}-${i}`} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  )
}

// ─── 아이템 row ───────────────────────────────────────

function ImpactItemRow({
  item, onNavigate,
}: {
  item: ImpactItem
  onNavigate?: (lawId: string, article?: string) => void
}) {
  const relationLabel = RELATION_LABELS[item.relation as RelationType] || item.relation

  return (
    <button
      className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-sm hover:bg-accent transition-colors"
      onClick={() => onNavigate?.(item.nodeId, item.article || undefined)}
    >
      {/* depth 들여쓰기 */}
      {item.depth > 1 && (
        <span className="text-muted-foreground" style={{ paddingLeft: `${(item.depth - 1) * 12}px` }}>
          └
        </span>
      )}
      <span className="truncate flex-1">
        {item.title}
        {item.article ? ` ${formatJo(item.article)}` : ''}
      </span>
      <Badge variant="outline" className="h-4 px-1 text-[10px] shrink-0">
        {relationLabel}
      </Badge>
    </button>
  )
}

// ─── 유틸 ─────────────────────────────────────────────

function formatJo(jo: string): string {
  if (!jo) return ''
  // 6자리 JO 코드 → "제38조" 형식
  if (/^\d{6}$/.test(jo)) {
    const num = parseInt(jo.substring(0, 4), 10)
    return `제${num}조`
  }
  // 이미 "제N조" 형식이면 그대로
  if (jo.startsWith('제')) return jo
  return jo
}
