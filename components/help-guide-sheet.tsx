'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Icon } from '@/components/ui/icon'
import { IconName } from '@/lib/icons'
import { cn } from '@/lib/utils'

type TabType = 'law' | 'ai'

interface HelpGuideSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: TabType
  onRestartTour?: () => void
}

export function HelpGuideSheet({
  open,
  onOpenChange,
  defaultTab = 'law',
  onRestartTour,
}: HelpGuideSheetProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab)

  // UX-9: 시트 열릴 때 또는 defaultTab 변경 시 동기화
  useEffect(() => {
    if (open) setActiveTab(defaultTab)
  }, [open, defaultTab])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[85vw] sm:max-w-md overflow-y-auto p-0"
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Icon name="help-circle" size={18} className="text-blue-500" />
              사용 가이드
            </SheetTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              aria-label="닫기"
            >
              <Icon name="x" size={18} className="text-muted-foreground" />
            </button>
          </div>
          <SheetDescription className="sr-only">
            LexDiff 사용 방법 안내
          </SheetDescription>

          {/* 탭 버튼 */}
          <div className="flex gap-1 mt-2">
            <TabButton
              active={activeTab === 'law'}
              onClick={() => setActiveTab('law')}
            >
              <Icon name="book-open" size={14} />
              법령 검색
            </TabButton>
            <TabButton
              active={activeTab === 'ai'}
              onClick={() => setActiveTab('ai')}
            >
              <Icon name="sparkles" size={14} />
              AI 검색
            </TabButton>
          </div>
        </SheetHeader>

        <div className="p-4">
          {onRestartTour && (
            <button
              onClick={onRestartTour}
              className="w-full mb-4 flex items-center justify-center gap-2 px-3 py-2.5 border border-brand-navy/20 bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy dark:text-foreground rounded-sm text-sm font-medium transition-colors"
            >
              <Icon name="play" size={16} />
              기능 투어 다시 보기
            </button>
          )}
          {activeTab === 'law' ? <LawGuideContent /> : <AIGuideContent />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

// ==================== 법령 검색 가이드 ====================
function LawGuideContent() {
  return (
    <div className="space-y-5">
      {/* 검색 방법 */}
      <GuideSection title="검색하기" icon="search">
        <GuideItem title="법령 이름으로 검색">
          <Example input="민법" result="민법 전체 조문 보기" />
          <Example input="근로기준법" result="근로기준법 전체 조문" />
        </GuideItem>

        <GuideItem title="특정 조문 바로가기">
          <Example input="관세법 38조" result="관세법 제38조로 바로 이동" />
          <Example input="민법 제750조" result="민법 제750조(불법행위)" />
        </GuideItem>

        <GuideItem title="조례도 검색 가능">
          <Example input="서울시 주차장 조례" result="지방자치단체 조례" />
        </GuideItem>
      </GuideSection>

      {/* 조문 보기 */}
      <GuideSection title="조문 보기" icon="eye">
        <GuideItem title="조문 목록">
          <p className="text-muted-foreground text-sm">
            왼쪽 목록에서 원하는 조문을 탭하세요
          </p>
        </GuideItem>

        <GuideItem title="빠른 이동">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>
            <span>검색창 열기</span>
          </div>
        </GuideItem>

        <GuideItem title="모바일 스와이프">
          <p className="text-muted-foreground text-sm">
            좌우 스와이프로 이전/다음 조문 이동
          </p>
        </GuideItem>
      </GuideSection>

      {/* 즐겨찾기 */}
      <GuideSection title="즐겨찾기" icon="star">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>자주 보는 조문을 저장해두세요</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>조문 화면에서 별 아이콘 탭</li>
            <li>홈 화면이나 <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>에서 빠르게 접근</li>
          </ol>
        </div>
      </GuideSection>

      {/* 비교 기능 */}
      <GuideSection title="비교 기능" icon="git-compare">
        <GuideItem title="개정 전후 비교">
          <p className="text-muted-foreground text-sm">
            조문이 바뀐 경우, 비교 버튼을 누르면 개정 전/후를 나란히 볼 수 있어요.
            변경된 부분이 하이라이트됩니다.
          </p>
        </GuideItem>

        <GuideItem title="3단 비교">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge color="yellow">법률</Badge>
            <Badge color="blue">시행령</Badge>
            <Badge color="purple">시행규칙</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            법률-시행령-시행규칙을 동시에 확인
          </p>
        </GuideItem>
      </GuideSection>

      {/* 참조 법령 */}
      <GuideSection title="참조 법령" icon="link-2">
        <p className="text-muted-foreground text-sm">
          조문 안의 <span className="text-blue-500">파란색 링크</span>를 탭하면
          해당 법령 조문이 바로 열려요
        </p>
      </GuideSection>

      {/* 단축키 */}
      <GuideSection title="단축키" icon="keyboard">
        <div className="space-y-2 text-sm">
          <ShortcutRow keys={['Ctrl', 'K']} desc="빠른 검색" />
          <ShortcutRow keys={['Esc']} desc="모달 닫기" />
          <ShortcutRow keys={['+', '-']} desc="글자 크기 조절" />
        </div>
      </GuideSection>
    </div>
  )
}

// ==================== AI 검색 가이드 ====================
function AIGuideContent() {
  return (
    <div className="space-y-5">
      {/* 질문 방법 */}
      <GuideSection title="질문하기" icon="message-square">
        <p className="text-muted-foreground text-sm mb-3">
          평소 말하듯이 자연스럽게 질문하세요
        </p>

        <GuideItem title="좋은 질문 예시">
          <ExampleQuestion>수출통관 절차가 어떻게 되나요?</ExampleQuestion>
          <ExampleQuestion>연차휴가 발생 요건은?</ExampleQuestion>
          <ExampleQuestion>불법행위 손해배상 요건</ExampleQuestion>
        </GuideItem>

        <GuideItem title="더 정확한 답변 받기">
          <Tip emoji="💡">
            법령명을 함께 쓰면 더 정확해요
          </Tip>
          <div className="mt-2 space-y-1">
            <CompareExample
              bad="연차휴가 요건"
              good="근로기준법에서 연차휴가 요건"
            />
            <CompareExample
              bad="계약 해제"
              good="민법상 계약 해제 요건"
            />
          </div>
        </GuideItem>
      </GuideSection>

      {/* 답변 구조 */}
      <GuideSection title="답변 이해하기" icon="file-text">
        <div className="space-y-2">
          <AnswerPart
            emoji="📋"
            title="핵심 요약"
            desc="질문에 대한 간단한 결론"
          />
          <AnswerPart
            emoji="📄"
            title="상세 내용"
            desc="법령 원문 인용 + 해석"
          />
          <AnswerPart
            emoji="🔗"
            title="관련 법령"
            desc="탭하면 해당 법령으로 이동"
          />
        </div>
      </GuideSection>

      {/* 출처 확인 */}
      <GuideSection title="출처 확인" icon="check-circle">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="text-green-500 font-medium">법령 기반</span> 배지가
            있으면 실제 법령을 인용한 답변이에요
          </p>
          <p>
            답변 안의 <span className="text-blue-500">파란색 링크</span>를
            탭하면 원문 조문을 확인할 수 있어요
          </p>
        </div>
      </GuideSection>

      {/* 질문 유형별 예시 */}
      <GuideSection title="질문 예시" icon="lightbulb">
        <div className="grid grid-cols-2 gap-3">
          <QuestionCategory title="개념">
            <SmallExample>관세법에서 수입이란?</SmallExample>
            <SmallExample>불법행위의 요건</SmallExample>
          </QuestionCategory>

          <QuestionCategory title="절차">
            <SmallExample>수출통관 절차</SmallExample>
            <SmallExample>관세 신고방법</SmallExample>
          </QuestionCategory>

          <QuestionCategory title="요건">
            <SmallExample>연차휴가 발생 요건</SmallExample>
            <SmallExample>중소기업 지원 대상</SmallExample>
          </QuestionCategory>

          <QuestionCategory title="비교">
            <SmallExample>상법 vs 민법 계약</SmallExample>
            <SmallExample>소득세 vs 법인세</SmallExample>
          </QuestionCategory>
        </div>
      </GuideSection>

      {/* 팁 */}
      <GuideSection title="검색 팁" icon="zap">
        <div className="space-y-2">
          <Tip emoji="1️⃣">법령명을 포함하면 정확도 UP</Tip>
          <Tip emoji="2️⃣">구체적으로 질문할수록 좋아요</Tip>
          <Tip emoji="3️⃣">"A와 B의 차이" 같은 비교 질문도 가능</Tip>
        </div>
      </GuideSection>
    </div>
  )
}

// ==================== 공통 컴포넌트 ====================

function GuideSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: IconName
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold mb-2 pb-1.5 border-b">
        <Icon name={icon} size={16} className="text-muted-foreground" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function GuideItem({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-1">{title}</h4>
      {children}
    </div>
  )
}

function Example({ input, result }: { input: string; result: string }) {
  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      <code className="text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">
        {input}
      </code>
      <Icon name="arrow-right" size={12} className="text-muted-foreground" />
      <span className="text-muted-foreground text-xs">{result}</span>
    </div>
  )
}

function ExampleQuestion({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground pl-2 border-l-2 border-violet-500/50 py-0.5">
      "{children}"
    </div>
  )
}

function CompareExample({ bad, good }: { bad: string; good: string }) {
  return (
    <div className="text-xs space-y-0.5">
      <div className="flex items-center gap-1.5">
        <Icon name="x" size={12} className="text-red-500" />
        <span className="text-muted-foreground">{bad}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Icon name="check" size={12} className="text-green-500" />
        <span className="text-muted-foreground">{good}</span>
      </div>
    </div>
  )
}

function AnswerPart({
  emoji,
  title,
  desc,
}: {
  emoji: string
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0">{emoji}</span>
      <div>
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground"> — {desc}</span>
      </div>
    </div>
  )
}

function QuestionCategory({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h5 className="text-xs font-medium text-muted-foreground mb-1">{title}</h5>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function SmallExample({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground truncate">• {children}</div>
  )
}

function Tip({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{emoji}</span>
      <span>{children}</span>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">
      {children}
    </kbd>
  )
}

function Badge({
  color,
  children,
}: {
  color: 'yellow' | 'blue' | 'purple'
  children: React.ReactNode
}) {
  const colorClasses = {
    yellow: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    blue: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
  }

  return (
    <span
      className={cn('px-1.5 py-0.5 rounded text-xs font-medium', colorClasses[color])}
    >
      {children}
    </span>
  )
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            <Kbd>{key}</Kbd>
            {i < keys.length - 1 && <span className="text-muted-foreground">+</span>}
          </span>
        ))}
      </div>
      <span className="text-muted-foreground">{desc}</span>
    </div>
  )
}
