import type React from "react"
import type { LawArticle, LawMeta, DelegationItem } from "@/lib/law-types"
import type { AdminRuleMatch } from "@/lib/use-admin-rules"

export type DelegationGroup = { lawName: string; items: DelegationItem[] }

export interface DelegationPanelProps {
    // Data
    activeArticle: LawArticle
    meta: LawMeta
    fontSize: number
    isOrdinance?: boolean

    // Three-Tier State
    validDelegations: DelegationItem[]
    isLoadingThreeTier: boolean
    delegationActiveTab: "law" | "decree" | "rule" | "admin"
    setDelegationActiveTab: (tab: "law" | "decree" | "rule" | "admin") => void
    delegationPanelSize: number
    setDelegationPanelSize: (size: number) => void

    // Admin Rules State
    showAdminRules: boolean
    setShowAdminRules: (show: boolean) => void
    loadingAdminRules: boolean
    loadedAdminRulesCount: number
    hasEverLoaded: boolean
    adminRules: AdminRuleMatch[]
    adminRulesProgress: { current: number; total: number } | null
    adminRuleViewMode: "list" | "detail"
    setAdminRuleViewMode: (mode: "list" | "detail") => void
    adminRuleHtml: string | null
    adminRuleTitle: string | null
    handleViewAdminRuleFullContent: (rule: AdminRuleMatch) => void

    // Font size controls
    increaseFontSize: () => void
    decreaseFontSize: () => void
    resetFontSize: () => void

    // Handlers
    handleContentClick: React.MouseEventHandler<HTMLDivElement>
}

export interface DelegationGroupCardProps {
    group: DelegationGroup
    fontSize: number
    delegationsHtmlCache: Map<string, string>
    delegationIndexByRef: Map<DelegationItem, number>
    handleContentClick: React.MouseEventHandler<HTMLDivElement>
}

export interface AdminRulesTabProps {
    showAdminRules: boolean
    loadingAdminRules: boolean
    hasEverLoaded: boolean
    adminRules: AdminRuleMatch[]
    adminRulesProgress: { current: number; total: number } | null
    adminRuleViewMode: "list" | "detail"
    setAdminRuleViewMode: (mode: "list" | "detail") => void
    adminRuleHtml: string | null
    adminRuleTitle: string | null
    handleViewAdminRuleFullContent: (rule: AdminRuleMatch) => void
    fontSize: number
    increaseFontSize: () => void
    decreaseFontSize: () => void
    resetFontSize: () => void
    handleContentClick: React.MouseEventHandler<HTMLDivElement>
    activeArticleJo: string
    isOrdinance?: boolean
}
