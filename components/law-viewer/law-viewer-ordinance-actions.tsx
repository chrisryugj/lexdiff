"use client"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { CopyButton } from "@/components/ui/copy-button"
import type { LawArticle } from "@/lib/law-types"

interface LawViewerOrdinanceActionsProps {
  isOrdinance: boolean
  actualArticles: LawArticle[]
  fontSize: number
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void
  openLawCenter: () => void
  onRefresh?: () => void
  formatSimpleJo: (jo: string, forceOrdinance?: boolean) => string
}

export function LawViewerOrdinanceActions({
  isOrdinance,
  actualArticles,
  fontSize,
  increaseFontSize,
  decreaseFontSize,
  resetFontSize,
  openLawCenter,
  onRefresh,
  formatSimpleJo,
}: LawViewerOrdinanceActionsProps) {
  if (!isOrdinance) {
    return null
  }

  return (
    <div className="border-b border-border px-3 sm:px-4 py-0.5 pt-2 sm:pt-3 pb-2 sm:pb-3">
      <div className="flex items-center justify-between gap-1">
        {/* 좌측: 원문 보기 */}
        <Button variant="outline" size="sm" onClick={openLawCenter} className="bg-transparent h-7 px-2">
          <Icon name="external-link" size={14} className="mr-1" />
          원문 보기
        </Button>

        {/* 우측: 새로고침 + 글자크기 + 복사 */}
        <div className="flex items-center gap-0.5">
          {/* 강제 새로고침 버튼 */}
          {onRefresh && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
              <Icon name="refresh-cw" size={14} />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
            <Icon name="zoom-out" size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
            <Icon name="rotate-clockwise" size={12} />
          </Button>
          <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
            <Icon name="zoom-in" size={14} />
          </Button>
          <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
          <CopyButton
            getText={() => actualArticles.map(a => `${formatSimpleJo(a.jo)}\n${a.content}`).join('\n\n')}
            message="전체 복사됨"
            className="h-7 w-7 p-0"
          />
        </div>
      </div>
    </div>
  )
}
