'use client'

import * as React from 'react'
import { useEffect, useState } from 'react'
import { HelpCircle, ExternalLink, Search, Keyboard, Star, GitCompare, Link2, MessageSquare, FileText, Quote, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import Link from 'next/link'

interface UsageGuidePopoverProps {
  type: 'law-search' | 'ai-search'
  showOnFirstVisit?: boolean
}

const STORAGE_KEY_PREFIX = 'lexdiff-guide-seen-'

export function UsageGuidePopover({
  type,
  showOnFirstVisit = true,
}: UsageGuidePopoverProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    if (showOnFirstVisit) {
      const storageKey = `${STORAGE_KEY_PREFIX}${type}`
      const hasSeen = localStorage.getItem(storageKey)

      if (!hasSeen) {
        // 첫 방문 시 약간의 딜레이 후 자동으로 표시
        const timer = setTimeout(() => {
          setOpen(true)
          localStorage.setItem(storageKey, 'true')
        }, 1000)

        return () => clearTimeout(timer)
      }
    }
  }, [type, showOnFirstVisit])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="사용법 안내"
      >
        <HelpCircle className="h-4 w-4 text-blue-500" />
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="사용법 안내"
        >
          <HelpCircle className="h-4 w-4 text-blue-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        {type === 'law-search' ? (
          <LawSearchGuide />
        ) : (
          <AISearchGuide />
        )}
        <div className="mt-4 pt-3 border-t border-border">
          <Link href={`/help#${type}`} onClick={() => setOpen(false)}>
            <Button variant="outline" size="sm" className="w-full">
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              자세히 보기
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function LawSearchGuide() {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm flex items-center gap-2">
        <span className="text-base">📖</span>
        법령 검색 빠른 가이드
      </h4>

      <div className="space-y-2.5 text-sm">
        <GuideItem
          icon={<Search className="h-3.5 w-3.5 text-blue-500" />}
          title="검색"
          description={<>&quot;민법&quot;, &quot;관세법 38조&quot;</>}
        />
        <GuideItem
          icon={<Keyboard className="h-3.5 w-3.5 text-green-500" />}
          title="탐색"
          description="좌측 목록 클릭, Ctrl+K"
        />
        <GuideItem
          icon={<Star className="h-3.5 w-3.5 text-yellow-500" />}
          title="즐겨찾기"
          description="별 아이콘 클릭"
        />
        <GuideItem
          icon={<GitCompare className="h-3.5 w-3.5 text-purple-500" />}
          title="비교"
          description="개정 전후 변경 확인"
        />
        <GuideItem
          icon={<Link2 className="h-3.5 w-3.5 text-cyan-500" />}
          title="링크"
          description="참조 법령 바로가기"
        />
      </div>
    </div>
  )
}

function AISearchGuide() {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm flex items-center gap-2">
        <span className="text-base">🤖</span>
        AI 검색 빠른 가이드
      </h4>

      <div className="space-y-2.5 text-sm">
        <GuideItem
          icon={<MessageSquare className="h-3.5 w-3.5 text-violet-500" />}
          title="질문"
          description="자연어로 물어보세요"
        />
        <div className="pl-6 text-xs text-muted-foreground">
          예) &quot;수출통관 절차는?&quot;
        </div>
        <GuideItem
          icon={<FileText className="h-3.5 w-3.5 text-blue-500" />}
          title="답변"
          description="요약 → 조문 → 실무 적용"
        />
        <GuideItem
          icon={<Quote className="h-3.5 w-3.5 text-green-500" />}
          title="출처"
          description="파란 링크로 원문 확인"
        />
        <GuideItem
          icon={<Zap className="h-3.5 w-3.5 text-yellow-500" />}
          title="팁"
          description="법령명 포함 시 더 정확!"
        />
      </div>
    </div>
  )
}

function GuideItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <span className="font-medium">{title}:</span>{' '}
        <span className="text-muted-foreground">{description}</span>
      </div>
    </div>
  )
}

// 가이드를 다시 보고 싶을 때 localStorage 초기화하는 유틸리티
export function resetUsageGuide(type?: 'law-search' | 'ai-search') {
  if (type) {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${type}`)
  } else {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}law-search`)
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}ai-search`)
  }
}
