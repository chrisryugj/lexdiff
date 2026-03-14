'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SEVERITY_CONFIG, type ImpactItem } from '@/lib/impact-tracker/types'

interface ImpactCardProps {
  item: ImpactItem
  onCompare?: (lawName: string, lawId: string, mst: string) => void
  onViewLaw?: (lawName: string, jo: string, joDisplay: string) => void
}

export function ImpactCard({ item, onCompare, onViewLaw }: ImpactCardProps) {
  const [expanded, setExpanded] = useState(false)
  const config = SEVERITY_CONFIG[item.severity]

  return (
    <div className={`border rounded-lg p-4 ${config.bgClass} transition-all hover:shadow-md`}>
      {/* 헤더: 등급 뱃지 + 법령명 + 조문 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            className={`${
              item.severity === 'critical'
                ? 'bg-red-600 text-white'
                : item.severity === 'review'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-green-600 text-white'
            }`}
          >
            {config.label}
          </Badge>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {item.change.lawName}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {item.change.joDisplay}
          </span>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {item.change.revisionType}
        </Badge>
      </div>

      {/* 중단: 하위법령 영향 수 + 날짜 */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
        {item.downstreamImpacts.length > 0 && (
          <span className="flex items-center gap-1">
            <Icon name="git-compare" size={12} />
            하위법령 {item.downstreamImpacts.length}건 영향
          </span>
        )}
        <span>{item.change.revisionDate}</span>
      </div>

      {/* AI 분류 근거 (접을 수 있음) */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
          AI 분류 근거
        </button>
        {expanded && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              {item.severityReason}
            </p>
            {item.downstreamImpacts.length > 0 && (
              <div className="text-xs">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">영향 받는 하위법령:</p>
                <ul className="list-disc list-inside text-gray-500 dark:text-gray-400">
                  {item.downstreamImpacts.map((d, i) => (
                    <li key={i}>
                      [{d.type}] {d.lawName} {d.joDisplay || ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        {onCompare && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => onCompare(item.change.lawName, item.change.lawId, item.change.mst)}
          >
            <Icon name="git-compare" size={12} />
            신구대비
          </Button>
        )}
        {onViewLaw && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => onViewLaw(item.change.lawName, item.change.jo, item.change.joDisplay)}
          >
            <Icon name="file-text" size={12} />
            조문 보기
          </Button>
        )}
      </div>
    </div>
  )
}
