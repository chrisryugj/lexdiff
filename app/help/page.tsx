'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, Keyboard, Star, GitCompare, Link2, Smartphone, MessageSquare, FileText, Quote, Zap, Lightbulb, CheckCircle, XCircle, BookOpen, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TabType = 'law-search' | 'ai-search'

export default function HelpPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('law-search')

  // 뒤로가기 핸들러 - 브라우저 히스토리 사용
  const handleBack = () => {
    // 히스토리가 있으면 뒤로가기, 없으면 홈으로
    if (window.history.length > 1) {
      window.history.back()
    } else {
      router.push('/')
    }
  }

  useEffect(() => {
    // URL 해시에서 탭 타입 읽기
    const hash = window.location.hash.replace('#', '') as TabType
    if (hash === 'law-search' || hash === 'ai-search') {
      setActiveTab(hash)
    }
  }, [searchParams])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <HelpCircle className="h-6 w-6 text-blue-500" />
              <h1 className="text-xl font-bold">LexDiff 사용 가이드</h1>
            </div>
          </div>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className="sticky top-[65px] z-30 bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1">
            <TabButton
              active={activeTab === 'law-search'}
              onClick={() => handleTabChange('law-search')}
              icon={<BookOpen className="h-4 w-4" />}
            >
              법령 검색
            </TabButton>
            <TabButton
              active={activeTab === 'ai-search'}
              onClick={() => handleTabChange('ai-search')}
              icon={<MessageSquare className="h-4 w-4" />}
            >
              AI 검색
            </TabButton>
          </div>
        </div>
      </div>

      {/* 콘텐츠 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'law-search' ? (
          <LawSearchGuide />
        ) : (
          <AISearchGuide />
        )}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function LawSearchGuide() {
  return (
    <div className="space-y-10">
      {/* 타이틀 */}
      <div className="text-center pb-6 border-b">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-3">
          <span className="text-3xl">📖</span>
          법령 검색 가이드
        </h2>
        <p className="text-muted-foreground mt-2">
          법령을 검색하고 조문을 탐색하는 방법을 알아보세요
        </p>
      </div>

      {/* 검색 방법 */}
      <Section
        icon={<Search className="h-5 w-5 text-blue-500" />}
        title="검색 방법"
      >
        <div className="space-y-6">
          <SubSection title="기본 검색">
            <p className="text-muted-foreground mb-3">
              검색창에 법령명을 입력하세요.
            </p>
            <ExampleBox>
              <ExampleItem>
                <code className="text-blue-400">민법</code>
                <span className="text-muted-foreground">→ 민법 전체 조문</span>
              </ExampleItem>
              <ExampleItem>
                <code className="text-blue-400">관세법</code>
                <span className="text-muted-foreground">→ 관세법 전체 조문</span>
              </ExampleItem>
              <ExampleItem>
                <code className="text-blue-400">서울시 주차장 조례</code>
                <span className="text-muted-foreground">→ 지방자치단체 조례</span>
              </ExampleItem>
            </ExampleBox>
          </SubSection>

          <SubSection title="조문 검색">
            <p className="text-muted-foreground mb-3">
              법령명과 조문 번호를 함께 입력하면 해당 조문으로 바로 이동합니다.
            </p>
            <ExampleBox>
              <ExampleItem>
                <code className="text-blue-400">관세법 38조</code>
                <span className="text-muted-foreground">→ 관세법 제38조로 이동</span>
              </ExampleItem>
              <ExampleItem>
                <code className="text-blue-400">민법 제1조</code>
                <span className="text-muted-foreground">→ 민법 제1조로 이동</span>
              </ExampleItem>
              <ExampleItem>
                <code className="text-blue-400">근로기준법 56조의2</code>
                <span className="text-muted-foreground">→ 근로기준법 제56조의2로 이동</span>
              </ExampleItem>
            </ExampleBox>
          </SubSection>
        </div>
      </Section>

      {/* 조문 탐색 */}
      <Section
        icon={<Keyboard className="h-5 w-5 text-green-500" />}
        title="조문 탐색"
      >
        <div className="space-y-6">
          <SubSection title="조문 목록">
            <p className="text-muted-foreground mb-3">
              화면 좌측의 조문 목록에서 원하는 조문을 클릭하세요.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-muted-foreground">즐겨찾기된 조문</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="빠른 검색 (Ctrl+K)">
            <p className="text-muted-foreground mb-3">
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl+K</kbd>를 누르면 검색 모달이 열립니다.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>조문 번호로 검색</li>
              <li>최근 검색어에서 선택</li>
              <li>즐겨찾기 목록에서 선택</li>
            </ul>
          </SubSection>

          <SubSection title="스와이프 (모바일)">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Smartphone className="h-4 w-4" />
              <p>모바일에서는 좌우로 스와이프하여 이전/다음 조문으로 이동할 수 있습니다.</p>
            </div>
          </SubSection>
        </div>
      </Section>

      {/* 즐겨찾기 */}
      <Section
        icon={<Star className="h-5 w-5 text-yellow-500" />}
        title="즐겨찾기"
      >
        <p className="text-muted-foreground mb-4">
          자주 찾는 조문을 저장해두세요.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>조문 보기 화면에서 <Star className="h-4 w-4 inline text-yellow-500" /> 아이콘 클릭</li>
          <li>홈 화면 또는 검색 모달(<kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+K</kbd>)에서 빠르게 접근</li>
          <li>즐겨찾기 관리: 우측 상단 별 아이콘</li>
        </ol>
      </Section>

      {/* 비교 기능 */}
      <Section
        icon={<GitCompare className="h-5 w-5 text-purple-500" />}
        title="비교 기능"
      >
        <div className="space-y-6">
          <SubSection title="개정 전후 비교">
            <p className="text-muted-foreground mb-3">
              조문이 개정된 경우, 비교 버튼을 클릭하면:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><strong>좌측:</strong> 개정 전 조문</li>
              <li><strong>우측:</strong> 개정 후 조문</li>
              <li>변경된 부분이 하이라이트됩니다</li>
            </ul>
          </SubSection>

          <SubSection title="개정 이력">
            <p className="text-muted-foreground">
              특정 조문의 모든 개정 내역을 확인할 수 있습니다.
              드롭다운에서 특정 날짜를 선택하세요.
            </p>
          </SubSection>
        </div>
      </Section>

      {/* 3단 비교 */}
      <Section
        icon={<FileText className="h-5 w-5 text-cyan-500" />}
        title="3단 비교"
      >
        <p className="text-muted-foreground mb-4">
          법률, 시행령, 시행규칙을 동시에 확인하세요.
        </p>
        <div className="flex flex-wrap gap-3">
          <Badge color="yellow">1단: 법률</Badge>
          <Badge color="blue">2단: 시행령</Badge>
          <Badge color="purple">3단: 시행규칙</Badge>
        </div>
        <p className="text-muted-foreground mt-3">
          각 단계별로 독립적으로 탐색할 수 있습니다.
        </p>
      </Section>

      {/* 참조 법령 */}
      <Section
        icon={<Link2 className="h-5 w-5 text-cyan-500" />}
        title="참조 법령"
      >
        <p className="text-muted-foreground mb-3">
          조문 내의 <span className="text-blue-500 font-medium">파란색 링크</span>를 클릭하면:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>참조된 법령의 해당 조문이 모달로 표시됩니다</li>
          <li>&quot;법제처에서 보기&quot; 버튼으로 공식 사이트 이동</li>
          <li>모달 내에서 다른 법령으로 이동 후 뒤로가기 가능</li>
        </ul>
      </Section>

      {/* 단축키 */}
      <Section
        icon={<Keyboard className="h-5 w-5 text-gray-500" />}
        title="단축키"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium">단축키</th>
                <th className="text-left py-2 font-medium">기능</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4">
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl+K</kbd>
                </td>
                <td className="py-2">빠른 검색 모달</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Esc</kbd>
                </td>
                <td className="py-2">모달/팝업 닫기</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">+</kbd> / <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">-</kbd>
                </td>
                <td className="py-2">글자 크기 조절</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function AISearchGuide() {
  return (
    <div className="space-y-10">
      {/* 타이틀 */}
      <div className="text-center pb-6 border-b">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-3">
          <span className="text-3xl">🤖</span>
          AI 검색 가이드
        </h2>
        <p className="text-muted-foreground mt-2">
          자연어로 법령을 검색하고 AI 답변을 활용하는 방법을 알아보세요
        </p>
      </div>

      {/* 질문 방법 */}
      <Section
        icon={<MessageSquare className="h-5 w-5 text-violet-500" />}
        title="질문 방법"
      >
        <div className="space-y-6">
          <SubSection title="자연어로 질문하세요">
            <p className="text-muted-foreground mb-4">
              복잡한 검색어 대신, 평소 말하듯이 질문하면 됩니다.
            </p>

            <div className="space-y-4">
              <div>
                <h5 className="text-sm font-medium mb-2 text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  좋은 질문 예시
                </h5>
                <ExampleBox>
                  <ExampleItem>
                    <span>&quot;수출통관 절차가 어떻게 되나요?&quot;</span>
                  </ExampleItem>
                  <ExampleItem>
                    <span>&quot;관세법에서 신고납부 제도의 요건은?&quot;</span>
                  </ExampleItem>
                  <ExampleItem>
                    <span>&quot;근로기준법 연차휴가 계산 방법&quot;</span>
                  </ExampleItem>
                </ExampleBox>
              </div>

              <div>
                <h5 className="text-sm font-medium mb-2 text-blue-500 flex items-center gap-1">
                  <Lightbulb className="h-4 w-4" />
                  더 좋은 질문 (법령명 포함)
                </h5>
                <ExampleBox>
                  <ExampleItem>
                    <span>&quot;관세법상 수입의 정의는?&quot;</span>
                  </ExampleItem>
                  <ExampleItem>
                    <span>&quot;민법에서 계약 성립 요건&quot;</span>
                  </ExampleItem>
                  <ExampleItem>
                    <span>&quot;상법과 민법의 소멸시효 차이&quot;</span>
                  </ExampleItem>
                </ExampleBox>
              </div>
            </div>
          </SubSection>
        </div>
      </Section>

      {/* 답변 이해하기 */}
      <Section
        icon={<FileText className="h-5 w-5 text-blue-500" />}
        title="답변 이해하기"
      >
        <p className="text-muted-foreground mb-4">
          AI 답변은 다음 구조로 제공됩니다:
        </p>

        <div className="space-y-4">
          <AnswerStructure
            emoji="📋"
            title="핵심 요약"
            description="질문에 대한 결론을 먼저 제시. 1-2문장으로 핵심 내용 정리"
          />
          <AnswerStructure
            emoji="📄"
            title="상세 내용"
            description={
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li><strong>조문 발췌:</strong> 관련 법령 원문 인용</li>
                <li><strong>핵심 해석:</strong> 법적 의미 설명</li>
                <li><strong>실무 적용:</strong> 실제 적용 방법</li>
              </ul>
            }
          />
          <AnswerStructure
            emoji="🔗"
            title="관련 법령"
            description="답변에 참조된 법령 목록. 클릭하면 해당 법령으로 이동"
          />
        </div>
      </Section>

      {/* 인용 출처 확인 */}
      <Section
        icon={<Quote className="h-5 w-5 text-green-500" />}
        title="인용 출처 확인"
      >
        <div className="space-y-6">
          <SubSection title="법령 기반 표시">
            <p className="text-muted-foreground mb-3">
              AI 답변이 실제 법령 조문을 인용한 경우, 헤더에 <span className="text-green-400 font-medium">&quot;법령 기반&quot;</span> 배지가 표시됩니다.
            </p>
          </SubSection>

          <SubSection title="출처 확인 방법">
            <ol className="list-decimal list-inside text-muted-foreground space-y-2">
              <li>답변 내 <span className="text-blue-500 font-medium">파란색 링크</span> 클릭하면 해당 법령으로 이동</li>
              <li>답변 하단의 <strong>관련 법령</strong> 목록에서 인용된 조문 확인</li>
            </ol>
          </SubSection>
        </div>
      </Section>

      {/* 검색 팁 */}
      <Section
        icon={<Zap className="h-5 w-5 text-yellow-500" />}
        title="검색 팁"
      >
        <SubSection title="더 정확한 답변을 받으려면">
          <div className="space-y-4">
            <TipItem number={1} title="법령명을 포함하세요">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-muted-foreground">&quot;연차휴가 요건&quot;</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-muted-foreground">&quot;근로기준법에서 연차휴가 요건&quot;</span>
              </div>
            </TipItem>

            <TipItem number={2} title="구체적으로 질문하세요">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-muted-foreground">&quot;세금 관련&quot;</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-muted-foreground">&quot;법인세법에서 과세표준 계산 방법&quot;</span>
              </div>
            </TipItem>

            <TipItem number={3} title="비교 질문도 가능합니다">
              <div className="text-sm text-muted-foreground">
                &quot;상법과 민법에서 계약 해제의 차이는?&quot;
              </div>
              <div className="text-sm text-muted-foreground">
                &quot;소득세와 법인세의 과세 기준 비교&quot;
              </div>
            </TipItem>
          </div>
        </SubSection>
      </Section>

      {/* 질문 예시 */}
      <Section
        icon={<Lightbulb className="h-5 w-5 text-amber-500" />}
        title="질문 예시"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <QuestionCategory title="개념 설명">
            <QuestionExample>&quot;관세법에서 수입이란 무엇인가요?&quot;</QuestionExample>
            <QuestionExample>&quot;법인세법의 과세표준은 어떻게 계산하나요?&quot;</QuestionExample>
          </QuestionCategory>

          <QuestionCategory title="절차 안내">
            <QuestionExample>&quot;수출통관 절차를 알려주세요&quot;</QuestionExample>
            <QuestionExample>&quot;관세 신고납부 방법은?&quot;</QuestionExample>
          </QuestionCategory>

          <QuestionCategory title="요건/조건">
            <QuestionExample>&quot;근로기준법에서 연차휴가 발생 요건은?&quot;</QuestionExample>
            <QuestionExample>&quot;조세특례제한법에서 중소기업 지원 대상은?&quot;</QuestionExample>
          </QuestionCategory>

          <QuestionCategory title="비교 분석">
            <QuestionExample>&quot;상법과 민법에서 계약 성립 요건의 차이&quot;</QuestionExample>
            <QuestionExample>&quot;관세법과 대외무역법의 적용 범위 비교&quot;</QuestionExample>
          </QuestionCategory>
        </div>
      </Section>
    </div>
  )
}

// 공통 컴포넌트들

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="scroll-mt-24" id={title.toLowerCase().replace(/\s+/g, '-')}>
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 pb-2 border-b">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function SubSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h4 className="font-medium mb-2">{title}</h4>
      {children}
    </div>
  )
}

function ExampleBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
      {children}
    </div>
  )
}

function ExampleItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {children}
    </div>
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
    yellow: 'bg-yellow-500/20 text-yellow-500',
    blue: 'bg-blue-500/20 text-blue-500',
    purple: 'bg-purple-500/20 text-purple-500',
  }

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colorClasses[color])}>
      {children}
    </span>
  )
}

function AnswerStructure({
  emoji,
  title,
  description,
}: {
  emoji: string
  title: string
  description: React.ReactNode
}) {
  return (
    <div className="flex gap-3 p-3 bg-muted/30 rounded-lg">
      <span className="text-xl shrink-0">{emoji}</span>
      <div>
        <h5 className="font-medium">{title}</h5>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function TipItem({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {number}
        </span>
        <span className="font-medium">{title}</span>
      </div>
      <div className="pl-7 space-y-1">
        {children}
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
      <h5 className="font-medium text-sm mb-2">{title}</h5>
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  )
}

function QuestionExample({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground pl-3 border-l-2 border-muted">
      {children}
    </div>
  )
}
