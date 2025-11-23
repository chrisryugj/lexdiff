import { useState } from 'react'
import { useAdminRules, type AdminRuleMatch } from '@/lib/use-admin-rules'
import type { LawMeta } from '@/lib/law-types'
import { parseAdminRuleContent, formatAdminRuleHTML } from '@/lib/admrul-parser'
import { getAdminRuleContentCache, setAdminRuleContentCache } from '@/lib/admin-rule-cache'

export function useLawViewerAdminRules(articleNumber: string, meta: LawMeta) {
  // Admin rules state
  const [showAdminRules, setShowAdminRules] = useState(false)
  const [adminRuleViewMode, setAdminRuleViewMode] = useState<"list" | "detail">("list")
  const [adminRuleHtml, setAdminRuleHtml] = useState<string>("")
  const [adminRuleTitle, setAdminRuleTitle] = useState<string>("")
  const [adminRuleMobileTab, setAdminRuleMobileTab] = useState<"law" | "adminRule">("law")
  const [loadedAdminRulesCount, setLoadedAdminRulesCount] = useState<number>(0)
  const [adminRulePanelSize, setAdminRulePanelSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 50
    const saved = localStorage.getItem('adminRulePanelSize')
    return saved ? Number.parseInt(saved, 10) : 50
  })

  // Admin rules data
  const {
    adminRules,
    isLoading: loadingAdminRules,
    error: adminRulesError,
    progress: adminRulesProgress
  } = useAdminRules(
    meta.lawTitle,
    articleNumber,
    showAdminRules // Only fetch when enabled
  )

  // Handler: view admin rule full content
  const handleViewAdminRuleFullContent = async (rule: AdminRuleMatch) => {
    try {
      // Use serialNumber first, fallback to id (same as test page)
      const idParam = rule.serialNumber || rule.id

      // Check IndexedDB cache first
      const cached = await getAdminRuleContentCache(idParam)
      if (cached) {
        setAdminRuleTitle(cached.title)
        setAdminRuleHtml(cached.html)
        setAdminRuleViewMode("detail")
        // Don't change tierViewMode - stay in tab view
        return
      }

      const contentParams = new URLSearchParams({ ID: idParam })

      // Set loading state
      setAdminRuleTitle(rule.name)
      setAdminRuleHtml('<div style="text-align: center; padding: 2rem 0; color: hsl(var(--muted-foreground));"><div style="display: inline-block; width: 2rem; height: 2rem; border: 2px solid currentColor; border-bottom-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div><p style="margin-top: 1rem;">로딩 중...</p><style>@keyframes spin { to { transform: rotate(360deg); }}</style></div>')
      setAdminRuleViewMode("detail")
      // Don't change tierViewMode - stay in tab view


      const contentResponse = await fetch(`/api/admrul?${contentParams.toString()}`, { cache: 'no-store' })
      if (!contentResponse.ok) {
        const errorText = await contentResponse.text()
        throw new Error(`행정규칙 조회 실패: ${contentResponse.status}`)
      }

      const contentXml = await contentResponse.text()

      const fullContent = parseAdminRuleContent(contentXml)

      if (!fullContent) {
        throw new Error("행정규칙 파싱 실패")
      }


      // Convert admin rule content to HTML - format like law text
      const htmlParts: string[] = []

      // Header with metadata
      if (fullContent.department || fullContent.publishDate || fullContent.effectiveDate) {
        htmlParts.push('<div style="padding: 12px; background: hsl(var(--secondary)); border-radius: 8px; margin-bottom: 24px; color: hsl(var(--foreground));">')
        const metadata: string[] = []
        if (fullContent.department) metadata.push(`<span style="font-size: 0.875rem;"><strong>소관부처:</strong> ${fullContent.department}</span>`)
        if (fullContent.publishDate) metadata.push(`<span style="font-size: 0.875rem;"><strong>발령일자:</strong> ${fullContent.publishDate}</span>`)
        if (fullContent.effectiveDate) metadata.push(`<span style="font-size: 0.875rem;"><strong>시행일자:</strong> ${fullContent.effectiveDate}</span>`)
        htmlParts.push(metadata.join(' | '))
        htmlParts.push('</div>')
      }

      // Articles - format using formatAdminRuleHTML (includes links + styling)
      let textParts: string[] = []

      fullContent.articles.forEach((article, idx) => {
        // Article title - bold inline style
        const titleHtml = '<strong style="font-size: 1rem;">' + article.number +
          (article.title ? ' <span style="font-weight: 400; color: hsl(var(--muted-foreground));">(' + article.title + ')</span>' : '') +
          '</strong>'

        textParts.push(titleHtml)
        textParts.push('\n') // 제목 뒤 줄바꿈 1개

        // Article content - format with links + styling + revision marks
        const formattedContent = formatAdminRuleHTML(article.content, meta.lawTitle)
        textParts.push(formattedContent)
        textParts.push('\n') // 조문 끝 줄바꿈

        // Add spacing between articles (Separator)
        if (idx < fullContent.articles.length - 1) {
          textParts.push('<hr style="margin: 0.5rem 0; border: 0; border-top: 1px solid hsl(var(--border));" />')
        }
      })

      const articlesHtml = textParts.join('')
      htmlParts.push(articlesHtml)
      const finalHtml = htmlParts.join('')
      const finalTitle = fullContent.name

      setAdminRuleTitle(finalTitle)
      setAdminRuleHtml(finalHtml)

      // Cache the result to IndexedDB
      await setAdminRuleContentCache(idParam, finalTitle, finalHtml, fullContent.effectiveDate)
    } catch (error: any) {
      setAdminRuleHtml(`<div style="text-align: center; padding: 2rem 0;"><p style="color: hsl(var(--destructive)); font-weight: 600; margin-bottom: 0.5rem;">전체 내용 조회 실패</p><p style="font-size: 0.875rem; color: hsl(var(--muted-foreground));">${error.message}</p></div>`)
    }
  }

  // Helper: get law.go.kr link
  const getLawGoKrLink = (serialNumber?: string) => {
    // Use serialNumber if available (same as test page)
    if (!serialNumber) return null
    return `https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=${serialNumber}`
  }

  return {
    // State
    showAdminRules,
    setShowAdminRules,
    adminRuleViewMode,
    setAdminRuleViewMode,
    adminRuleHtml,
    adminRuleTitle,
    adminRuleMobileTab,
    setAdminRuleMobileTab,
    adminRulePanelSize,
    setAdminRulePanelSize,
    loadedAdminRulesCount,
    setLoadedAdminRulesCount,

    // Data
    adminRules,
    loadingAdminRules,
    adminRulesError,
    adminRulesProgress,

    // Handlers
    handleViewAdminRuleFullContent,
    getLawGoKrLink,
  }
}
