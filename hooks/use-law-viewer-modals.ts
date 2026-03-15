import { useState, useCallback } from 'react'
import type { LawMeta, LawArticle } from '@/lib/law-types'
import { formatJO } from '@/lib/law-parser'
import { debugLogger } from '@/lib/debug-logger'
import {
  fetchOrdinanceArticle,
  fetchOldLawArticle,
  fetchCurrentLawArticle,
  searchLawByName,
  extractJoCode,
  type ModalResult,
} from './law-viewer-modal-fetchers'

interface PrecedentMeta {
  court?: string
  caseNumber?: string
  date?: string
  judgmentType?: string
}

interface ModalState {
  open: boolean
  title?: string
  html?: string
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
  loading?: boolean
  precedentMeta?: PrecedentMeta
}

interface ModalHistoryItem {
  title: string
  html?: string
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
}

/** 별표 모달 상태 */
interface AnnexModalState {
  open: boolean
  annexNumber: string
  lawName: string
  lawId?: string
}

export function useLawViewerModals(meta: LawMeta, activeArticle: LawArticle | undefined) {
  // Modal state
  const [refModal, setRefModal] = useState<ModalState>({ open: false })
  const [refModalHistory, setRefModalHistory] = useState<ModalHistoryItem[]>([])
  const [lastExternalRef, setLastExternalRef] = useState<{ lawName: string; joLabel?: string } | null>(null)

  // 별표 모달 상태
  const [annexModal, setAnnexModal] = useState<AnnexModalState>({
    open: false,
    annexNumber: '',
    lawName: '',
  })

  /** 모달 히스토리에 현재 상태 저장 */
  function pushHistory() {
    if (refModal.open && refModal.title) {
      setRefModalHistory(prev => [...prev, {
        title: refModal.title!,
        html: refModal.html,
        forceWhiteTheme: refModal.forceWhiteTheme,
        lawName: refModal.lawName,
        articleNumber: refModal.articleNumber,
      }])
    }
  }

  /** ModalResult를 ModalState로 적용 */
  function applyResult(result: ModalResult) {
    pushHistory()
    setRefModal({
      open: true,
      title: result.title,
      html: result.html,
      lawName: result.lawName,
      articleNumber: result.articleNumber,
      forceWhiteTheme: result.forceWhiteTheme,
    })
  }

  // Handler: open external law article modal
  async function openExternalLawArticleModal(lawName: string, articleLabel: string, efYd?: string, isOldLaw?: boolean) {
    const cleanedLawName = lawName.replace(/[「」『』]/g, '').trim()

    // 로딩 상태로 모달 먼저 열기
    setRefModal({
      open: true,
      title: `${cleanedLawName} ${articleLabel || ''}`.trim(),
      loading: true,
      lawName: cleanedLawName,
      articleNumber: articleLabel,
    })

    try {
      // ── 경로 1: 자치법규 ──
      const isOrdinance = (/조례/.test(cleanedLawName) ||
        (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(cleanedLawName) && !/시행규칙|시행령/.test(cleanedLawName))) &&
        !/시행규칙|시행령/.test(cleanedLawName)

      if (isOrdinance) {
        try {
          const result = await fetchOrdinanceArticle(cleanedLawName, articleLabel)
          applyResult(result)
          return
        } catch (ordinError) {
          debugLogger.error('[citation] 자치법규 조회 실패, 법제처 링크로 폴백', ordinError)
          setRefModal({
            open: true,
            title: `${cleanedLawName} ${articleLabel}`,
            html: `<div class="space-y-3"><p>자치법규 조회 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/자치법규/${encodeURIComponent(cleanedLawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline inline-flex items-center gap-1">법제처에서 보기 →</a></div></div>`,
            lawName: cleanedLawName,
            articleNumber: articleLabel,
          })
          return
        }
      }

      // ── 법령 검색으로 lawId/mst 얻기 ──
      const { lawId, mst } = await searchLawByName(cleanedLawName)

      if (!lawId && !mst) {
        setRefModal({
          open: true,
          title: cleanedLawName,
          html: `<p>법령을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(cleanedLawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 검색하기</a></p>`,
        })
        return
      }

      const joCode = extractJoCode(articleLabel)

      // ── 경로 2: 구법령 (efYd 있는 경우) ──
      if (efYd) {
        try {
          const result = await fetchOldLawArticle(cleanedLawName, articleLabel, efYd, joCode)
          applyResult(result)
          return
        } catch (oldLawErr) {
          debugLogger.error('[citation] 구법령 조회 실패, 현행법으로 폴백', oldLawErr)
          // 아래 현행법 조회로 폴백
        }
      }

      // ── 경로 3: 현행법 조회 ──
      const isOldLawRequest = !!(efYd || isOldLaw)
      if (isOldLawRequest && !efYd) {
        debugLogger.info('[citation] 구법령 플래그만 있음 - 현행법으로 조회', { lawName: cleanedLawName, articleLabel, isOldLaw })
      }

      try {
        const result = await fetchCurrentLawArticle(cleanedLawName, articleLabel, joCode, lawId, mst, isOldLawRequest, efYd)
        applyResult(result)
      } catch (fetchErr) {
        debugLogger.error('[citation] eflaw fetch 오류', fetchErr)
        setRefModal({
          open: true,
          title: `${cleanedLawName} ${articleLabel}`,
          html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(cleanedLawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기</a></div></div>`,
        })
      }
    } catch (err) {
      debugLogger.error('[citation] 전체 오류', err)
      setRefModal({
        open: true,
        title: `${cleanedLawName} ${articleLabel}`,
        html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(cleanedLawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기</a></div></div>`,
      })
    }
  }

  // Helper: open related law (decree or rule) modal
  async function openRelatedLawModal(kind: "decree" | "rule") {
    const kindLabel = kind === "decree" ? "시행령" : "시행규칙"

    try {
      if (!meta.lawId && !meta.mst) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>관련 법령 정보를 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      const hierarchyParams = new URLSearchParams()
      if (meta.lawId) hierarchyParams.append("lawId", meta.lawId)
      else if (meta.mst) hierarchyParams.append("mst", meta.mst)

      const hierarchyRes = await fetch(`/api/hierarchy?${hierarchyParams.toString()}`)
      const hierarchyXml = await hierarchyRes.text()

      const { parseHierarchyXML } = await import("@/lib/hierarchy-parser")
      const hierarchy = parseHierarchyXML(hierarchyXml)

      if (!hierarchy?.lowerLaws?.length) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>${kindLabel}을 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle + " " + kindLabel)}" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      const relatedLaw = hierarchy.lowerLaws.find((l) => l.type === kind)

      if (!relatedLaw) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>${kindLabel}을 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle + " " + kindLabel)}" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      if (activeArticle) {
        try {
          const joLabel = formatJO(activeArticle.jo)
          await openExternalLawArticleModal(relatedLaw.lawName, joLabel)
          return
        } catch {
          // 같은 조문 찾기 실패 → 관련법 정보 표시
        }
      }

      setRefModal({
        open: true,
        title: relatedLaw.lawName,
        html: `<div class="space-y-3"><p>해당 ${kindLabel}을 찾았습니다.</p><p class="text-sm"><strong>${relatedLaw.lawName}</strong></p><div class="flex gap-2 mt-4"><a href="https://www.law.go.kr/법령/${encodeURIComponent(relatedLaw.lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 전문 보기</a></div></div>`,
      })
    } catch {
      setRefModal({
        open: true,
        title: `${meta.lawTitle} ${kindLabel}`,
        html: `<p>${kindLabel} 조회 중 오류가 발생했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
      })
    }
  }

  // Helper: fetch law hierarchy and show in modal
  async function openLawHierarchyModal(lawName: string) {
    try {
      const searchRes = await fetch(`/api/law-search?${new URLSearchParams({ query: lawName })}`)
      const searchXml = await searchRes.text()
      const lawIdMatch = searchXml.match(/<법령ID>([^<]+)<\/법령ID>/)
      const mstMatch = searchXml.match(/<법령일련번호>([^<]+)<\/법령일련번호>/)

      if (!lawIdMatch && !mstMatch) {
        setRefModal({
          open: true,
          title: lawName,
          html: `<p>법령을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 검색하기 →</a></p>`,
          forceWhiteTheme: true,
        })
        return
      }

      const lawId = lawIdMatch?.[1]
      const mst = mstMatch?.[1]

      const hierarchyParams = new URLSearchParams()
      if (lawId) hierarchyParams.append("lawId", lawId)
      else if (mst) hierarchyParams.append("mst", mst)

      const hierarchyRes = await fetch(`/api/hierarchy?${hierarchyParams.toString()}`)
      const hierarchyXml = await hierarchyRes.text()

      const { parseHierarchyXML } = await import("@/lib/hierarchy-parser")
      const hierarchy = parseHierarchyXML(hierarchyXml)

      if (!hierarchy) {
        setRefModal({
          open: true,
          title: lawName,
          html: `<p>법령 체계도를 불러올 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기 →</a></p>`,
          forceWhiteTheme: true,
        })
        return
      }

      let html = `<div class="space-y-4">`

      if (hierarchy.upperLaws?.length) {
        html += `<div><h4 class="font-semibold mb-2">상위 법령</h4><ul class="list-disc list-inside space-y-1">`
        for (const upper of hierarchy.upperLaws) {
          html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${upper.lawName}">${upper.lawName}</a></li>`
        }
        html += `</ul></div>`
      }

      html += `<div><h4 class="font-semibold mb-2">현재 법령</h4><p>${hierarchy.lawName}</p>`
      if (hierarchy.effectiveDate) html += `<p class="text-sm text-muted-foreground">시행일: ${hierarchy.effectiveDate}</p>`
      html += `</div>`

      if (hierarchy.lowerLaws?.length) {
        const decrees = hierarchy.lowerLaws.filter((l) => l.type === "decree")
        const rules = hierarchy.lowerLaws.filter((l) => l.type === "rule")

        if (decrees.length > 0) {
          html += `<div><h4 class="font-semibold mb-2">시행령</h4><ul class="list-disc list-inside space-y-1">`
          for (const d of decrees) html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${d.lawName}">${d.lawName}</a></li>`
          html += `</ul></div>`
        }
        if (rules.length > 0) {
          html += `<div><h4 class="font-semibold mb-2">시행규칙</h4><ul class="list-disc list-inside space-y-1">`
          for (const r of rules) html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${r.lawName}">${r.lawName}</a></li>`
          html += `</ul></div>`
        }
      }

      html += `<div class="pt-2 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-sm text-primary hover:underline">법제처에서 전문 보기 →</a></div></div>`

      setRefModal({ open: true, title: `${lawName} 체계도`, html, forceWhiteTheme: true })
    } catch {
      setRefModal({
        open: true,
        title: lawName,
        html: `<p>법령 체계도를 불러오는 중 오류가 발생했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기 →</a></p>`,
        forceWhiteTheme: true,
      })
    }
  }

  // Handler: modal back navigation
  const handleRefModalBack = () => {
    const lastItem = refModalHistory[refModalHistory.length - 1]
    if (lastItem) {
      setRefModal({ open: true, ...lastItem })
      setRefModalHistory(prev => prev.slice(0, -1))
    }
  }

  // Handler: 법령 전체보기
  const handleViewFullLaw = useCallback(() => {
    const currentLawName = refModal.lawName
    if (!currentLawName) return
    openExternalLawArticleModal(currentLawName, '')
  }, [refModal.lawName])

  // Handler: 별표 모달 열기/닫기
  const openAnnexModal = useCallback((annexNumber: string, lawName: string, lawId?: string) => {
    debugLogger.info('[modal] 별표 모달 열기', { annexNumber, lawName, lawId })
    setAnnexModal({ open: true, annexNumber, lawName, lawId })
  }, [])

  const closeAnnexModal = useCallback(() => {
    setAnnexModal({ open: false, annexNumber: '', lawName: '' })
  }, [])

  return {
    refModal, setRefModal,
    refModalHistory, setRefModalHistory,
    lastExternalRef, setLastExternalRef,
    annexModal, setAnnexModal,
    openExternalLawArticleModal,
    openRelatedLawModal,
    openLawHierarchyModal,
    handleRefModalBack,
    handleViewFullLaw,
    openAnnexModal,
    closeAnnexModal,
  }
}
