import { useState } from 'react'
import type { LawMeta, LawArticle } from '@/lib/law-types'
import { buildJO, formatJO } from '@/lib/law-parser'
import { extractArticleText } from '@/lib/law-xml-parser'
import { debugLogger } from '@/lib/debug-logger'

interface ModalState {
  open: boolean
  title?: string
  html?: string
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
}

interface ModalHistoryItem {
  title: string
  html?: string
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
}

export function useLawViewerModals(meta: LawMeta, activeArticle: LawArticle | undefined) {
  // Modal state
  const [refModal, setRefModal] = useState<ModalState>({ open: false })
  const [refModalHistory, setRefModalHistory] = useState<ModalHistoryItem[]>([])
  const [lastExternalRef, setLastExternalRef] = useState<{ lawName: string; joLabel?: string } | null>(null)

  // Handler: open external law article modal
  async function openExternalLawArticleModal(lawName: string, articleLabel: string) {
    try {
      // ✅ 법령명 정규화: 따옴표 제거 (「도로법」 → 도로법)
      const cleanedLawName = lawName.replace(/[「」『』]/g, '').trim()

      // 자치법규 여부 감지
      // "시행규칙", "시행령"은 국가법령이므로 제외
      const isOrdinance = (/조례/.test(cleanedLawName) ||
        (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(cleanedLawName) && !/시행규칙|시행령/.test(cleanedLawName))) &&
        !/시행규칙|시행령/.test(cleanedLawName)

      // 자치법규는 법제처 자치법규 페이지로 리다이렉트
      if (isOrdinance) {
        const lawGoKrUrl = `https://www.law.go.kr/자치법규/${encodeURIComponent(cleanedLawName)}/${encodeURIComponent(articleLabel)}`
        setRefModal({
          open: true,
          title: `${cleanedLawName} ${articleLabel}`,
          html: `<div class="space-y-3"><p>자치법규는 법제처 자치법규 페이지에서 확인하실 수 있습니다.</p><div class="pt-3 border-t"><a href="${lawGoKrUrl}" target="_blank" rel="noopener" class="text-primary hover:underline inline-flex items-center gap-1">법제처에서 ${cleanedLawName} ${articleLabel} 보기 →</a></div></div>`,
          lawName: cleanedLawName,
          articleNumber: articleLabel,
        })
        return
      }

      const qs = new URLSearchParams({ query: cleanedLawName })
      const searchRes = await fetch(`/api/law-search?${qs.toString()}`)
      const searchXml = await searchRes.text()


      const parser = new DOMParser()
      const searchDoc = parser.parseFromString(searchXml, "text/xml")

      // ✅ 모든 법령 검색하고 가장 짧은 이름 선택 (정확 매칭 우선)
      const allLaws = Array.from(searchDoc.querySelectorAll("law"))
      const normalizedSearchName = cleanedLawName.replace(/\s+/g, "")

      const exactMatches = allLaws.filter(lawNode => {
        const nodeLawName = lawNode.querySelector("법령명한글")?.textContent || ""
        return nodeLawName.replace(/\s+/g, "") === normalizedSearchName
      })

      const lawNode = exactMatches.length > 0
        ? exactMatches.reduce((shortest, current) => {
            const shortestName = shortest.querySelector("법령명한글")?.textContent || ""
            const currentName = current.querySelector("법령명한글")?.textContent || ""
            return currentName.length < shortestName.length ? current : shortest
          })
        : allLaws[0]


      const lawId = lawNode?.querySelector("법령ID")?.textContent || undefined
      const mst = lawNode?.querySelector("법령일련번호")?.textContent || undefined
      const effectiveDate = lawNode?.querySelector("시행일자")?.textContent || undefined


      if (!lawId && !mst) {
        setRefModal({
          open: true,
          title: cleanedLawName,
          html: `<p>법령을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(cleanedLawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 검색하기</a></p>`,
        })
        return
      }

      // Extract just the article number (제X조 or 제X조의Y) from articleLabel
      // articleLabel might be "제5조제2항" or "제55조제12호" but buildJO only handles "제5조"
      // Remove 항(paragraph) and 호(item) parts: 제N항, 제N호
      let joCode = ""
      try {
        const articleOnly = articleLabel.match(/(제\d+조(?:의\d+)?)/)?.[1] || articleLabel
        joCode = buildJO(articleOnly)
      } catch (err) {
      }

      const identifierParams = new URLSearchParams()
      if (lawId) {
        identifierParams.append("lawId", lawId)
      } else if (mst) {
        identifierParams.append("mst", mst)
      }
      // ⚠️ jo 파라미터 제거 - API가 잘못된 조문을 반환하는 버그 방지
      // 전체 법령을 가져온 후 클라이언트에서 필터링
      // ⚠️ efYd를 사용하지 않음 - 최신 시행 버전 조회
      // 타법개정으로 인한 조문 누락 방지

      try {
        const eflawRes = await fetch(`/api/eflaw?${identifierParams.toString()}`)

        if (!eflawRes.ok) {
          throw new Error(`HTTP ${eflawRes.status}`)
        }

        const eflawJson = await eflawRes.json()

        const lawData = eflawJson?.법령

        const rawArticleUnits = lawData?.조문?.조문단위

        const articleUnits = Array.isArray(rawArticleUnits)
          ? rawArticleUnits
          : rawArticleUnits
            ? [rawArticleUnits]
            : []


        const normalizedJo = joCode || ((articleUnits[0]?.조문키 || "").slice(0, 6))

        // 🔍 디버깅: 조문 검색 상세 로그
        debugLogger.info('[citation] Article search details', {
          lawName: cleanedLawName,
          articleLabel,
          joCode,
          normalizedJo,
          totalArticles: articleUnits.length,
          firstArticle: articleUnits[0] ? {
            조문키: articleUnits[0]?.조문키,
            조문번호: articleUnits[0]?.조문번호
          } : null
        })


        // ⚠️ 조문여부가 "조문"인 것만 찾기 (전문 제외)

        const targetUnit =
          articleUnits.find((unit: any) => {
            const isArticle = unit?.조문여부 === "조문"
            const hasKey = typeof unit?.조문키 === "string"
            const matches = hasKey && unit.조문키.startsWith(normalizedJo)
            return isArticle && hasKey && matches
          }) ||
          articleUnits.find((unit: any) => {
            const num = typeof unit?.조문번호 === "string" ? unit.조문번호.replace(/\D/g, "") : ""
            const targetNum = articleLabel.replace(/\D/g, "")
            return unit?.조문여부 === "조문" && num !== "" && targetNum !== "" && num === targetNum
          })

        if (targetUnit) {
        }

        if (!targetUnit) {
          setRefModal({
            open: true,
            title: `${cleanedLawName} ${articleLabel}`,
            html: `<p>해당 조문을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(cleanedLawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기</a></p>`,
          })
          return
        }

        // ⚠️ 조문내용이 제목만 있는 경우가 많으므로 항 배열을 텍스트로 변환
        let rawContent = targetUnit.조문내용 || ""
        const title = targetUnit.조문제목 || ""


        // 먼저 조문내용에서 제목 부분 제거 (항/호 처리 전에)
        if (rawContent && title) {
          // 제1조(목적) 이 법은... → 이 법은...
          const titlePattern = new RegExp(`^제${targetUnit.조문번호}조(?:의\\d+)?\\s*\\(${title}\\)\\s*`, 'i')
          if (titlePattern.test(rawContent)) {
            rawContent = rawContent.replace(titlePattern, '')
          }
        }

        // 항 처리: 배열 또는 단일 객체일 수 있음
        const hangArray = Array.isArray(targetUnit.항)
          ? targetUnit.항
          : targetUnit.항
            ? [targetUnit.항]
            : []

        if (hangArray.length > 0) {
          // ✅ 먼저 항내용이 있는지 확인
          const hasHangContent = hangArray.some((hang: any) => (hang?.항내용 || "").trim())

          // 호 내용 추출
          const allHo = hangArray.flatMap((hang: any) => {
            const hoInHang = Array.isArray(hang?.호) ? hang.호 : hang?.호 ? [hang.호] : []
            return hoInHang
          })

          if (hasHangContent) {
            // 항내용이 있는 경우 → 기존 로직 (항내용 + 호)
            const paragraphsText = hangArray.map((hang: any) => {
              const hangContent = hang?.항내용 || ""
              const hoInHang = Array.isArray(hang?.호) ? hang.호 : hang?.호 ? [hang.호] : []

              if (hoInHang.length > 0) {
                const itemsText = hoInHang.map((ho: any) => ho?.호내용 || "").join('\n')
                return hangContent ? `${hangContent}\n${itemsText}` : itemsText
              }

              return hangContent
            }).join('\n\n')

            rawContent = paragraphsText
          } else if (allHo.length > 0) {
            // 항내용 없고 호만 있는 경우 → paragraphs 구조로 전달 (extractArticleText가 처리)
            // rawContent는 본문만 유지, 호는 별도로 처리
            // rawContent는 본문만 유지 (호 합치지 않음)
          } else {
            // 항내용도 없고 호도 없음 → rawContent 그대로
          }
        }
        // 항 없이 최상위 호만 있는 경우 처리
        else if (Array.isArray(targetUnit.호) && targetUnit.호.length > 0) {
          // rawContent는 본문만 유지 (호 합치지 않음)
        } else {
        }

        // paragraphs 구조 생성 (항내용 없고 호만 있는 경우)
        let paragraphs: any[] | undefined
        if (hangArray.length > 0) {
          const hasHangContent = hangArray.some((hang: any) => (hang?.항내용 || "").trim())
          const allHo = hangArray.flatMap((hang: any) => {
            const hoInHang = Array.isArray(hang?.호) ? hang.호 : hang?.호 ? [hang.호] : []
            return hoInHang
          })

          if (!hasHangContent && allHo.length > 0) {
            // 항내용 없고 호만 있는 경우 → paragraphs 구조로 전달
            paragraphs = [{
              num: "",
              content: "",
              items: allHo.map((ho: any, idx: number) => ({
                num: `${idx + 1}`,
                content: ho?.호내용 || ""
              }))
            }]
          }
        } else if (Array.isArray(targetUnit.호) && targetUnit.호.length > 0) {
          // 최상위 호만 있는 경우
          paragraphs = [{
            num: "",
            content: "",
            items: targetUnit.호.map((ho: any, idx: number) => ({
              num: `${idx + 1}`,
              content: ho?.호내용 || ""
            }))
          }]
        }

        const lawArticle: LawArticle = {
          jo: normalizedJo,
          joNum: articleLabel,
          title,
          content: rawContent,
          isPreamble: false,
          paragraphs
        }

        const articleTitle = `${lawName} ${formatJO(lawArticle.jo)}${lawArticle.title ? ` (${lawArticle.title})` : ""}`


        const htmlContent = extractArticleText(lawArticle, false, meta.lawTitle)

        // ⚠️ 조문 내용이 비어있는 경우 에러 메시지 표시
        if (!htmlContent || htmlContent.trim().length === 0) {
          setRefModal({
            open: true,
            title: articleTitle,
            html: `<div class="space-y-3"><p>⚠️ 조문 내용을 불러올 수 없습니다.</p><p class="text-sm text-muted-foreground">이 조문은 최근 개정으로 인해 내용이 변경되었거나 삭제되었을 수 있습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기</a></div></div>`,
          })
          return
        }

        // 현재 모달이 열려있으면 히스토리에 저장
        if (refModal.open && refModal.title) {
          setRefModalHistory(prev => [...prev, {
            title: refModal.title!,
            html: refModal.html,
            forceWhiteTheme: refModal.forceWhiteTheme,
            lawName: refModal.lawName,
            articleNumber: refModal.articleNumber,
          }])
        }

        setRefModal({
          open: true,
          title: articleTitle,
          html: htmlContent,
          lawName: lawName,
          articleNumber: articleLabel,
        })
      } catch (fetchErr: any) {
        setRefModal({
          open: true,
          title: `${lawName} ${articleLabel}`,
          html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기</a></div></div>`,
        })
      }
    } catch (err) {
      setRefModal({
        open: true,
        title: `${lawName} ${articleLabel}`,
        html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기</a></div></div>`,
      })
    }
  }

  // Helper: open related law (decree or rule) modal
  async function openRelatedLawModal(kind: "decree" | "rule") {
    const kindLabel = kind === "decree" ? "시행령" : "시행규칙"

    try {
      // First, get the hierarchy to find the related law name
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

      if (!hierarchy || !hierarchy.lowerLaws || hierarchy.lowerLaws.length === 0) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>${kindLabel}을 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle + " " + kindLabel)}" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      // Find the matching decree or rule
      const relatedLaw = hierarchy.lowerLaws.find((l) => l.type === kind)

      if (!relatedLaw) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>${kindLabel}을 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle + " " + kindLabel)}" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      // Try to find the same article in the related law
      if (activeArticle) {
        try {
          const joLabel = formatJO(activeArticle.jo)
          await openExternalLawArticleModal(relatedLaw.lawName, joLabel)
          return
        } catch {
          // If finding the same article fails, show the related law info
        }
      }

      // Fallback: show related law info with link
      setRefModal({
        open: true,
        title: relatedLaw.lawName,
        html: `<div class="space-y-3"><p>해당 ${kindLabel}을 찾았습니다.</p><p class="text-sm"><strong>${relatedLaw.lawName}</strong></p><div class="flex gap-2 mt-4"><a href="https://www.law.go.kr/법령/${encodeURIComponent(relatedLaw.lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 전문 보기</a></div></div>`,
      })
    } catch (err) {
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
      // First search for the law to get its ID
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

      // Fetch hierarchy information
      const hierarchyParams = new URLSearchParams()
      if (lawId) hierarchyParams.append("lawId", lawId)
      else if (mst) hierarchyParams.append("mst", mst)

      const hierarchyRes = await fetch(`/api/hierarchy?${hierarchyParams.toString()}`)
      const hierarchyXml = await hierarchyRes.text()

      const { parseHierarchyXML } = await import("@/lib/hierarchy-parser")
      const hierarchy = parseHierarchyXML(hierarchyXml)

      if (!hierarchy) {
        // Fallback to basic law page
        setRefModal({
          open: true,
          title: lawName,
          html: `<p>법령 체계도를 불러올 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기 →</a></p>`,
          forceWhiteTheme: true,
        })
        return
      }

      // Build hierarchy display HTML
      let html = `<div class="space-y-4">`

      // Upper laws
      if (hierarchy.upperLaws && hierarchy.upperLaws.length > 0) {
        html += `<div><h4 class="font-semibold mb-2">상위 법령</h4><ul class="list-disc list-inside space-y-1">`
        for (const upper of hierarchy.upperLaws) {
          html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${upper.lawName}">${upper.lawName}</a></li>`
        }
        html += `</ul></div>`
      }

      // Current law
      html += `<div><h4 class="font-semibold mb-2">현재 법령</h4><p>${hierarchy.lawName}</p>`
      if (hierarchy.effectiveDate) {
        html += `<p class="text-sm text-muted-foreground">시행일: ${hierarchy.effectiveDate}</p>`
      }
      html += `</div>`

      // Lower laws (decree and rule)
      if (hierarchy.lowerLaws && hierarchy.lowerLaws.length > 0) {
        const decrees = hierarchy.lowerLaws.filter((l) => l.type === "decree")
        const rules = hierarchy.lowerLaws.filter((l) => l.type === "rule")

        if (decrees.length > 0) {
          html += `<div><h4 class="font-semibold mb-2">시행령</h4><ul class="list-disc list-inside space-y-1">`
          for (const decree of decrees) {
            html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${decree.lawName}">${decree.lawName}</a></li>`
          }
          html += `</ul></div>`
        }

        if (rules.length > 0) {
          html += `<div><h4 class="font-semibold mb-2">시행규칙</h4><ul class="list-disc list-inside space-y-1">`
          for (const rule of rules) {
            html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${rule.lawName}">${rule.lawName}</a></li>`
          }
          html += `</ul></div>`
        }
      }

      html += `<div class="pt-2 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-sm text-primary hover:underline">법제처에서 전문 보기 →</a></div>`
      html += `</div>`

      setRefModal({
        open: true,
        title: `${lawName} 체계도`,
        html,
        forceWhiteTheme: true,
      })
    } catch (err) {
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
      setRefModal({
        open: true,
        ...lastItem
      })
      setRefModalHistory(prev => prev.slice(0, -1))
    }
  }

  return {
    // State
    refModal,
    setRefModal,
    refModalHistory,
    setRefModalHistory,
    lastExternalRef,
    setLastExternalRef,

    // Handlers
    openExternalLawArticleModal,
    openRelatedLawModal,
    openLawHierarchyModal,
    handleRefModalBack,
  }
}
