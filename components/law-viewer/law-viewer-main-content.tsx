import React from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VirtualizedFullArticleView } from "@/components/virtualized-full-article-view"
import { DelegationPanel } from "@/components/law-viewer-delegation-panel"
import { PrecedentDetailPanel } from "@/components/precedent-section"
import { AIAnswerContent } from "@/components/law-viewer-ai-answer"
import { LawViewerSingleArticle } from "./law-viewer-single-article"
import type { LawMeta, LawArticle } from "@/lib/law-types"
import type { VerifiedCitation } from "@/lib/citation-verifier"
import type { ToolCallLogEntry, ConversationEntry } from "@/components/search-result-view/types"

// Props 그룹화
interface AIAnswerProps {
  content?: string
  userQuery: string
  confidenceLevel: 'high' | 'medium' | 'low'
  fileSearchFailed: boolean
  citations: VerifiedCitation[]
  queryType?: 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence' | 'scope' | 'exemption'
  isTruncated: boolean
  onRefresh?: () => void
  isStreaming: boolean
  searchProgress: number
  onLawClick: (lawName: string, article?: string) => void
  toolCallLogs?: ToolCallLogEntry[]
  conversationHistory?: ConversationEntry[]
  onFollowUp?: (query: string) => void
  onNewConversation?: () => void
}

type DelegationTabType = "law" | "decree" | "rule" | "admin"

interface DelegationProps {
  validDelegations: any[]
  isLoading: boolean
  activeTab: DelegationTabType
  setActiveTab: React.Dispatch<React.SetStateAction<DelegationTabType>>
  panelSize: number
  setPanelSize: (size: number) => void
  showAdminRules: boolean
  setShowAdminRules: (show: boolean) => void
  loadingAdminRules: boolean
  loadedAdminRulesCount: number
  hasEverLoaded: boolean
  adminRules: any[]
  adminRulesProgress: { current: number; total: number } | null
  adminRuleViewMode: "list" | "detail"
  setAdminRuleViewMode: React.Dispatch<React.SetStateAction<"list" | "detail">>
  adminRuleHtml: string | null
  adminRuleTitle: string | null
  handleViewAdminRuleFullContent: (rule: any) => Promise<void>
}

interface PrecedentProps {
  showPrecedents: boolean
  viewMode: "bottom" | "side"
  panelSize: number
  setPanelSize: (size: number) => void
  precedents: any[]
  totalCount: number
  loading: boolean
  error: string | null
  selectedPrecedent: any
  loadingDetail: boolean
  handleViewDetail: (precedent: any) => void
  expandPanel: () => void
  collapsePanel: () => void
}

interface FontProps {
  fontSize: number
  setFontSize: React.Dispatch<React.SetStateAction<number>>
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void
}

interface LawViewerMainContentProps {
  // Refs
  contentRef: React.RefObject<HTMLDivElement | null>
  swipeRef: React.RefObject<HTMLDivElement | null>

  // Mode flags
  aiAnswerMode: boolean
  viewMode: "single" | "full"
  tierViewMode: string
  isOrdinance: boolean
  isPrecedent: boolean

  // Article data
  activeArticle: LawArticle | undefined
  activeArticleHtml: string
  actualArticles: LawArticle[]
  preambles: LawArticle[]
  activeJo: string
  articleRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>

  // Meta
  meta: LawMeta

  // Revision
  revisionHistory: any[]

  // Grouped props
  fontProps: FontProps
  aiAnswerProps: AIAnswerProps
  delegationProps: DelegationProps
  precedentProps: PrecedentProps

  // Handlers
  handleContentClick: React.MouseEventHandler<HTMLDivElement>
  onRefresh?: () => void
  onToggleFavorite?: (jo: string) => void
  isFavorite: (jo: string) => boolean
  formatSimpleJo: (jo: string, forceOrdinance?: boolean) => string
}

export function LawViewerMainContent({
  contentRef,
  swipeRef,
  aiAnswerMode,
  viewMode,
  tierViewMode,
  isOrdinance,
  isPrecedent,
  activeArticle,
  activeArticleHtml,
  actualArticles,
  preambles,
  activeJo,
  articleRefs,
  meta,
  revisionHistory,
  fontProps,
  aiAnswerProps,
  delegationProps,
  precedentProps,
  handleContentClick,
  onRefresh,
  onToggleFavorite,
  isFavorite,
  formatSimpleJo,
}: LawViewerMainContentProps) {
  const { fontSize, setFontSize, increaseFontSize, decreaseFontSize, resetFontSize } = fontProps

  // AI 모드
  if (aiAnswerMode) {
    return (
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full" ref={contentRef}>
          <div className="pb-20 overflow-x-hidden">
            <AIAnswerContent
              aiAnswerContent={aiAnswerProps.content || ''}
              userQuery={aiAnswerProps.userQuery}
              aiConfidenceLevel={aiAnswerProps.confidenceLevel}
              fileSearchFailed={aiAnswerProps.fileSearchFailed}
              aiCitations={aiAnswerProps.citations}
              fontSize={fontSize}
              setFontSize={setFontSize}
              onLawClick={aiAnswerProps.onLawClick}
              aiQueryType={aiAnswerProps.queryType}
              isTruncated={aiAnswerProps.isTruncated}
              onRefresh={aiAnswerProps.onRefresh}
              isStreaming={aiAnswerProps.isStreaming}
              searchProgress={aiAnswerProps.searchProgress}
              toolCallLogs={aiAnswerProps.toolCallLogs}
              conversationHistory={aiAnswerProps.conversationHistory}
              onFollowUp={aiAnswerProps.onFollowUp}
              onNewConversation={aiAnswerProps.onNewConversation}
            />
          </div>
        </ScrollArea>
      </div>
    )
  }

  // 전문조회 모드
  if (viewMode === "full") {
    if (tierViewMode === "2-tier" && activeArticle) {
      return (
        <div className="flex-1 min-h-0">
          <DelegationPanel
            activeArticle={activeArticle}
            meta={meta}
            fontSize={fontSize}
            validDelegations={delegationProps.validDelegations}
            isLoadingThreeTier={delegationProps.isLoading}
            delegationActiveTab={delegationProps.activeTab}
            setDelegationActiveTab={delegationProps.setActiveTab}
            delegationPanelSize={delegationProps.panelSize}
            setDelegationPanelSize={delegationProps.setPanelSize}
            showAdminRules={delegationProps.showAdminRules}
            setShowAdminRules={delegationProps.setShowAdminRules}
            loadingAdminRules={delegationProps.loadingAdminRules}
            loadedAdminRulesCount={delegationProps.loadedAdminRulesCount}
            hasEverLoaded={delegationProps.hasEverLoaded}
            adminRules={delegationProps.adminRules}
            adminRulesProgress={delegationProps.adminRulesProgress}
            adminRuleViewMode={delegationProps.adminRuleViewMode}
            setAdminRuleViewMode={delegationProps.setAdminRuleViewMode}
            adminRuleHtml={delegationProps.adminRuleHtml}
            adminRuleTitle={delegationProps.adminRuleTitle}
            handleViewAdminRuleFullContent={delegationProps.handleViewAdminRuleFullContent}
            increaseFontSize={increaseFontSize}
            decreaseFontSize={decreaseFontSize}
            resetFontSize={resetFontSize}
            handleContentClick={handleContentClick}
            isOrdinance={isOrdinance}
          />
        </div>
      )
    }

    return (
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full" ref={contentRef}>
          <div ref={swipeRef}>
            <VirtualizedFullArticleView
              articles={actualArticles}
              preambles={preambles}
              activeJo={activeJo}
              fontSize={fontSize}
              lawTitle={meta.lawTitle}
              lawId={meta.lawId}
              mst={meta.mst}
              effectiveDate={meta.effectiveDate}
              onContentClick={handleContentClick}
              articleRefs={articleRefs}
              scrollParentRef={contentRef}
              isOrdinance={isOrdinance}
              isPrecedent={isPrecedent}
            />
          </div>
        </ScrollArea>
      </div>
    )
  }

  // 단문 조회 모드 - 조문 없음
  if (!activeArticle) {
    return (
      <div className="flex-1 min-h-0">
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>조문을 선택하세요</p>
        </div>
      </div>
    )
  }

  // 단문 조회 - 위임법령 2단 모드
  if (tierViewMode === "2-tier") {
    return (
      <div className="flex-1 min-h-0">
        <DelegationPanel
          activeArticle={activeArticle}
          meta={meta}
          fontSize={fontSize}
          validDelegations={delegationProps.validDelegations}
          isLoadingThreeTier={delegationProps.isLoading}
          delegationActiveTab={delegationProps.activeTab}
          setDelegationActiveTab={delegationProps.setActiveTab}
          delegationPanelSize={delegationProps.panelSize}
          setDelegationPanelSize={delegationProps.setPanelSize}
          showAdminRules={delegationProps.showAdminRules}
          setShowAdminRules={delegationProps.setShowAdminRules}
          loadingAdminRules={delegationProps.loadingAdminRules}
          loadedAdminRulesCount={delegationProps.loadedAdminRulesCount}
          hasEverLoaded={delegationProps.hasEverLoaded}
          adminRules={delegationProps.adminRules}
          adminRulesProgress={delegationProps.adminRulesProgress}
          adminRuleViewMode={delegationProps.adminRuleViewMode}
          setAdminRuleViewMode={delegationProps.setAdminRuleViewMode}
          adminRuleHtml={delegationProps.adminRuleHtml}
          adminRuleTitle={delegationProps.adminRuleTitle}
          handleViewAdminRuleFullContent={delegationProps.handleViewAdminRuleFullContent}
          increaseFontSize={increaseFontSize}
          decreaseFontSize={decreaseFontSize}
          resetFontSize={resetFontSize}
          handleContentClick={handleContentClick}
          isOrdinance={isOrdinance}
        />
      </div>
    )
  }

  // 단문 조회 - 판례 사이드 패널 모드
  if (precedentProps.showPrecedents && precedentProps.viewMode === "side") {
    return (
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" className="h-full">
          {/* 좌측: 조문 본문 */}
          <Panel defaultSize={100 - precedentProps.panelSize} minSize={30}>
            <ScrollArea className="h-full" ref={contentRef}>
              <div ref={swipeRef}>
                <LawViewerSingleArticle
                  activeArticle={activeArticle}
                  activeArticleHtml={activeArticleHtml}
                  meta={meta}
                  revisionHistory={revisionHistory}
                  fontSize={fontSize}
                  isOrdinance={isOrdinance}
                  onRefresh={onRefresh}
                  onToggleFavorite={onToggleFavorite}
                  isFavorite={isFavorite}
                  increaseFontSize={increaseFontSize}
                  decreaseFontSize={decreaseFontSize}
                  resetFontSize={resetFontSize}
                  handleContentClick={handleContentClick}
                  formatSimpleJo={formatSimpleJo}
                  showPrecedents={true}
                  precedentViewMode="side"
                  precedents={precedentProps.precedents}
                  precedentTotalCount={precedentProps.totalCount}
                  loadingPrecedents={precedentProps.loading}
                  precedentsError={precedentProps.error}
                  selectedPrecedent={precedentProps.selectedPrecedent}
                  loadingPrecedentDetail={precedentProps.loadingDetail}
                  handleViewPrecedentDetail={precedentProps.handleViewDetail}
                  expandPrecedentPanel={precedentProps.expandPanel}
                  collapsePrecedentPanel={precedentProps.collapsePanel}
                />
              </div>
            </ScrollArea>
          </Panel>

          {/* 리사이즈 핸들 */}
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          {/* 우측: 판례 상세 패널 */}
          <Panel
            defaultSize={precedentProps.panelSize}
            minSize={25}
            maxSize={60}
            onResize={(size) => precedentProps.setPanelSize(size)}
          >
            <div className="h-full border-l border-border bg-muted/10">
              <div className="h-full flex flex-col">
                {/* 패널 헤더 */}
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Icon name="scale" size={16} className="text-primary" />
                    <h3 className="font-semibold text-sm">판례 상세</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={precedentProps.collapsePanel}
                    className="h-7 px-2"
                  >
                    <Icon name="x" size={14} className="mr-1" />
                    닫기
                  </Button>
                </div>

                {/* 판례 상세 내용 */}
                <div className="flex-1 min-h-0">
                  <PrecedentDetailPanel
                    detail={precedentProps.selectedPrecedent}
                    loading={precedentProps.loadingDetail}
                    onClose={precedentProps.collapsePanel}
                    onContentClick={handleContentClick as (e: React.MouseEvent) => void}
                    onViewPrecedent={precedentProps.handleViewDetail}
                  />
                </div>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    )
  }

  // 단문 조회 - 기본 모드
  return (
    <div className="flex-1 min-h-0">
      <ScrollArea className="h-full" ref={contentRef}>
        <div ref={swipeRef}>
          <LawViewerSingleArticle
            activeArticle={activeArticle}
            activeArticleHtml={activeArticleHtml}
            meta={meta}
            revisionHistory={revisionHistory}
            fontSize={fontSize}
            isOrdinance={isOrdinance}
            onRefresh={onRefresh}
            onToggleFavorite={onToggleFavorite}
            isFavorite={isFavorite}
            increaseFontSize={increaseFontSize}
            decreaseFontSize={decreaseFontSize}
            resetFontSize={resetFontSize}
            handleContentClick={handleContentClick}
            formatSimpleJo={formatSimpleJo}
            showPrecedents={precedentProps.showPrecedents}
            precedentViewMode={precedentProps.viewMode}
            precedents={precedentProps.precedents}
            precedentTotalCount={precedentProps.totalCount}
            loadingPrecedents={precedentProps.loading}
            precedentsError={precedentProps.error}
            selectedPrecedent={precedentProps.selectedPrecedent}
            loadingPrecedentDetail={precedentProps.loadingDetail}
            handleViewPrecedentDetail={precedentProps.handleViewDetail}
            expandPrecedentPanel={precedentProps.expandPanel}
            collapsePrecedentPanel={precedentProps.collapsePanel}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
