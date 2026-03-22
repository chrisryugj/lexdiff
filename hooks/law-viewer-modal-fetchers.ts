import type { LawArticle } from '@/lib/law-types'
import { buildJO } from '@/lib/law-parser'
import { extractArticleText } from '@/lib/law-xml-parser'
import { debugLogger } from '@/lib/debug-logger'
import { parseOrdinanceSearchXML } from '@/lib/ordin-search-parser'
import { parseOrdinanceXML } from '@/lib/ordin-parser'
import { LAW_GO_KR } from '@/lib/law-constants'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ModalResult {
  title: string
  html: string
  lawName?: string
  articleNumber?: string
  forceWhiteTheme?: boolean
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function safeString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) {
    const flatten = (arr: unknown[]): string[] => {
      const result: string[] = []
      for (const item of arr) {
        if (typeof item === "string") {
          if (!item.startsWith("<img") && !item.startsWith("</img")) {
            result.push(item)
          }
        } else if (Array.isArray(item)) {
          result.push(...flatten(item))
        }
      }
      return result
    }
    return flatten(value).join("\n")
  }
  return ""
}

interface RawUnit {
  조문번호?: unknown
  조문제목?: unknown
  조문내용?: unknown
  조문키?: unknown
  조문여부?: string
  항?: unknown
  호?: unknown[]
}

function convertUnitToLawArticle(unit: RawUnit): LawArticle {
  const joNum = safeString(unit.조문번호)
  const title = safeString(unit.조문제목)
  let rawContent = safeString(unit.조문내용)
  const joKey = safeString(unit.조문키)

  let actualArticleNum = 0
  let actualBranchNum = 0
  if (joKey.length === 7) {
    actualArticleNum = parseInt(joKey.substring(0, 4), 10)
    actualBranchNum = parseInt(joKey.substring(4, 6), 10)
  } else {
    actualArticleNum = parseInt(joNum, 10) || 0
  }

  const escapedTitle = title ? title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
  const displayJoNumForRemoval = actualBranchNum > 0
    ? `제${actualArticleNum}조의${actualBranchNum}`
    : `제${actualArticleNum}조(?:의\\d+)?`

  if (rawContent && title) {
    const titlePattern = new RegExp(`^${displayJoNumForRemoval}\\s*[\\(\\（]${escapedTitle}[\\)\\）]\\s*`, 'i')
    if (titlePattern.test(rawContent)) {
      rawContent = rawContent.replace(titlePattern, '')
    }
  }

  const hangArray = Array.isArray(unit.항)
    ? unit.항 as RawUnit[]
    : unit.항 ? [unit.항 as RawUnit] : []

  let paragraphs: LawArticle['paragraphs'] = undefined

  if (hangArray.length > 0) {
    const hasHangContent = hangArray.some((hang) => safeString((hang as Record<string, unknown>)?.항내용).trim())
    const allHo = hangArray.flatMap((hang) => {
      const h = hang as Record<string, unknown>
      const hoInHang = Array.isArray(h?.호) ? h.호 : h?.호 ? [h.호] : []
      return hoInHang as Record<string, unknown>[]
    })

    if (hasHangContent) {
      paragraphs = hangArray.map((hang) => {
        const h = hang as Record<string, unknown>
        const hoInHang = Array.isArray(h?.호) ? h.호 as Record<string, unknown>[] : h?.호 ? [h.호 as Record<string, unknown>] : []
        let hangContent = safeString(h?.항내용)

        if (hangContent && escapedTitle) {
          const titlePatternInHang = new RegExp(`^${displayJoNumForRemoval}\\s*[\\(\\（]${escapedTitle}[\\)\\）]\\s*`, 'i')
          hangContent = hangContent.replace(titlePatternInHang, '')
        }

        return {
          num: safeString(h?.항번호),
          content: hangContent,
          items: hoInHang.length > 0
            ? hoInHang.map((ho) => ({
                num: safeString(ho?.호번호),
                content: safeString(ho?.호내용)
              }))
            : undefined
        }
      })
      rawContent = ""
    } else if (allHo.length > 0) {
      paragraphs = [{
        num: "",
        content: "",
        items: allHo.map((ho) => ({
          num: safeString(ho?.호번호),
          content: safeString(ho?.호내용)
        }))
      }]
    }
  } else if (Array.isArray(unit.호) && unit.호.length > 0) {
    paragraphs = [{
      num: "",
      content: "",
      items: (unit.호 as Record<string, unknown>[]).map((ho) => ({
        num: safeString(ho?.호번호),
        content: safeString(ho?.호내용)
      }))
    }]
  }

  let normalizedJo = ""
  let displayJoNumResult = ""

  if (actualArticleNum > 0) {
    normalizedJo = actualArticleNum.toString().padStart(4, "0") + actualBranchNum.toString().padStart(2, "0")
    displayJoNumResult = actualBranchNum > 0
      ? `제${actualArticleNum}조의${actualBranchNum}`
      : `제${actualArticleNum}조`
  } else {
    displayJoNumResult = joNum.startsWith("제") ? joNum : `제${joNum}조`
  }

  return {
    jo: normalizedJo,
    joNum: displayJoNumResult,
    title,
    content: rawContent,
    isPreamble: false,
    paragraphs
  }
}

/** 법제처 링크 폴백 HTML 생성 */
function lawGoKrFallback(lawName: string, articleLabel: string, message: string, isOrdinance = false): string {
  const base = isOrdinance ? LAW_GO_KR.ORDINANCE_VIEW : LAW_GO_KR.LAW_VIEW
  const url = `${base}/${encodeURIComponent(lawName)}${articleLabel ? `/${encodeURIComponent(articleLabel)}` : ''}`
  return `<div class="space-y-3"><p>${message}</p><div class="pt-3 border-t"><a href="${url}" target="_blank" rel="noopener" class="text-primary hover:underline inline-flex items-center gap-1">법제처에서 ${lawName} ${articleLabel} 보기 →</a></div></div>`
}

/** 조문번호에서 JO 코드 추출 */
function extractJoCode(articleLabel: string): string {
  if (!articleLabel?.trim() || !/제?\d+/.test(articleLabel)) return ""
  try {
    const articleOnly = articleLabel.match(/(제\d+조(?:의\d+)?)/)?.[1] || articleLabel
    return buildJO(articleOnly)
  } catch {
    return ""
  }
}

/** 조문 번호 유무 */
function hasArticle(articleLabel: string): boolean {
  return !!(articleLabel && articleLabel.trim() && /제?\d+/.test(articleLabel))
}

/** 전체 조문 HTML 빌드 */
function buildAllArticlesHtml(articles: LawArticle[], lawName: string, isOrdinance: boolean): string {
  return articles
    .map(article => {
      const titlePart = article.title ? ` (${article.title})` : ''
      const header = `<div class="font-semibold text-primary mb-1">${article.joNum}${titlePart}</div>`
      const content = extractArticleText(article, isOrdinance, lawName)
      return `<div class="mb-4 pb-4 border-b border-border/30 last:border-0">${header}<div class="text-sm leading-relaxed">${content}</div></div>`
    })
    .join('')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 자치법규 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function fetchOrdinanceArticle(
  cleanedLawName: string,
  articleLabel: string,
): Promise<ModalResult> {
  debugLogger.info('[citation] 자치법규 본문 조회 시작', { lawName: cleanedLawName, articleLabel })

  // 재시도 헬퍼 (law.go.kr API 간헐 실패 대응)
  const fetchWithRetry = async (url: string, maxRetries = 2): Promise<Response> => {
    for (let i = 0; i <= maxRetries; i++) {
      const res = await fetch(url)
      if (res.ok) return res
      if (i < maxRetries) {
        debugLogger.info('[citation] 자치법규 API 재시도', { url, attempt: i + 1, status: res.status })
        await new Promise(r => setTimeout(r, 500 * (i + 1)))
      } else {
        throw new Error(`자치법규 API 실패 (${res.status}) — ${url.split('?')[0]}`)
      }
    }
    throw new Error('unreachable')
  }

  // 1. 검색
  const searchQuery = cleanedLawName.replace(/[·•‧]/g, ' ').replace(/\s+/g, ' ').trim()
  const ordinSearchRes = await fetchWithRetry(`/api/ordin-search?query=${encodeURIComponent(searchQuery)}`)

  const ordinSearchXml = await ordinSearchRes.text()
  const { ordinances: ordinSearchResults } = parseOrdinanceSearchXML(ordinSearchXml)

  const normalizeForCompare = (s: string) => s.replace(/[·•‧\s]/g, "")
  const normalizedSearchName = normalizeForCompare(cleanedLawName)
  // ordinId 또는 ordinSeq가 있는 결과만 사용 가능
  const usableResults = ordinSearchResults.filter(r => r.ordinId || r.ordinSeq)
  const exactMatch = usableResults.find(r => normalizeForCompare(r.ordinName) === normalizedSearchName)
  const ordinResult = exactMatch || usableResults[0]
  const ordinId = ordinResult?.ordinId
  const ordinSeq = ordinResult?.ordinSeq

  if (!ordinId && !ordinSeq) {
    return {
      title: `${cleanedLawName} ${articleLabel}`,
      html: lawGoKrFallback(cleanedLawName, articleLabel, '자치법규를 찾지 못했습니다.', true),
      lawName: cleanedLawName, articleNumber: articleLabel,
    }
  }

  // 2. 본문 조회
  const ordinParams = new URLSearchParams()
  if (ordinId) ordinParams.append("ordinId", ordinId)
  else if (ordinSeq) ordinParams.append("ordinSeq", ordinSeq)

  const ordinRes = await fetchWithRetry(`/api/ordin?${ordinParams.toString()}`)
  if (!ordinRes.ok) throw new Error('자치법규 본문 조회 실패')

  const ordinXml = await ordinRes.text()
  const { articles: ordinArticles } = parseOrdinanceXML(ordinXml)

  // 3. 조문 번호가 없으면 전문 표시
  if (!hasArticle(articleLabel)) {
    const allHtml = buildAllArticlesHtml(ordinArticles, cleanedLawName, true)
    return {
      title: `${cleanedLawName} 전문`,
      html: `<div class="space-y-2">${allHtml}</div>`,
      lawName: cleanedLawName, articleNumber: '',
    }
  }

  // 4. 특정 조문 찾기
  const articleOnly = articleLabel.match(/(제\d+조(?:의\d+)?)/)?.[1] || articleLabel
  const match = articleOnly.match(/제(\d+)조(?:의(\d+))?/)
  let targetJo = ""
  if (match) {
    targetJo = parseInt(match[1], 10).toString().padStart(2, "0") +
               (match[2] ? parseInt(match[2], 10) : 0).toString().padStart(2, "0") + "00"
  }

  let targetArticle = ordinArticles.find(a => a.jo === targetJo)
  if (!targetArticle) {
    const targetNum = articleLabel.replace(/[^0-9]/g, "")
    targetArticle = ordinArticles.find(a => a.joNum.replace(/[^0-9]/g, "") === targetNum)
  }

  if (!targetArticle) {
    return {
      title: cleanedLawName,
      html: lawGoKrFallback(cleanedLawName, articleLabel, '조문을 찾을 수 없습니다.', true),
      lawName: cleanedLawName, articleNumber: articleLabel,
    }
  }

  // 5. HTML 생성
  const articleTitle = `${cleanedLawName} ${targetArticle.joNum}${targetArticle.title ? ` (${targetArticle.title})` : ""}`
  const htmlContent = extractArticleText(targetArticle, true, cleanedLawName)

  if (!htmlContent?.trim()) {
    return {
      title: articleTitle,
      html: lawGoKrFallback(cleanedLawName, articleLabel, '⚠️ 조문 내용을 불러올 수 없습니다.', true),
      lawName: cleanedLawName, articleNumber: articleLabel,
    }
  }

  debugLogger.success('[citation] 자치법규 모달 열기 완료', { articleTitle })
  return { title: articleTitle, html: htmlContent, lawName: cleanedLawName, articleNumber: articleLabel }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 구법령 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function fetchOldLawArticle(
  cleanedLawName: string,
  articleLabel: string,
  efYd: string,
  joCode: string,
): Promise<ModalResult> {
  debugLogger.info('[citation] 구법령 조회 시작', { lawName: cleanedLawName, articleLabel, efYd })

  const oldLawParams = new URLSearchParams({ lawName: cleanedLawName, efYd })
  if (joCode) oldLawParams.append('jo', joCode)

  const res = await fetch(`/api/old-law?${oldLawParams.toString()}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  if (data.error) throw new Error(data.error)

  const { historyInfo, lawData, targetArticle } = data

  const articleUnits: RawUnit[] = (() => {
    const raw = lawData?.법령?.조문?.조문단위
    return Array.isArray(raw) ? raw : raw ? [raw] : []
  })()

  const historyNotice = `<div class="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-sm text-amber-700 dark:text-amber-400">
    <strong>📜 연혁 법령</strong>: ${historyInfo.efYd.substring(0, 4)}. ${parseInt(historyInfo.efYd.substring(4, 6))}. ${parseInt(historyInfo.efYd.substring(6, 8))}. 시행 (${historyInfo.rrCls || '개정'}, 법률 제${historyInfo.ancNo}호)
  </div>`

  // 조문 번호 없으면 전문
  if (!hasArticle(articleLabel)) {
    const allUnits = articleUnits.filter(u => u?.조문여부 === "조문")
    const articles = allUnits.map(u => convertUnitToLawArticle(u))
    const allHtml = buildAllArticlesHtml(articles, cleanedLawName, false)
    return {
      title: `구 ${cleanedLawName} 전문`,
      html: `${historyNotice}<div class="space-y-2">${allHtml}</div>`,
      lawName: cleanedLawName, articleNumber: '',
    }
  }

  // 특정 조문 검색
  let targetUnit = targetArticle
  if (!targetUnit && articleUnits.length > 0) {
    targetUnit = articleUnits.find((unit) => {
      return unit?.조문여부 === "조문" && typeof unit?.조문키 === "string" && (unit.조문키 as string).startsWith(joCode)
    }) || articleUnits.find((unit) => {
      const num = typeof unit?.조문번호 === "string" ? (unit.조문번호 as string).replace(/\D/g, "") : ""
      const targetNum = articleLabel.replace(/\D/g, "")
      return unit?.조문여부 === "조문" && num !== "" && targetNum !== "" && num === targetNum
    })
  }

  if (!targetUnit) {
    return {
      title: `구 ${cleanedLawName} ${articleLabel || ''}`.trim(),
      html: `<div class="space-y-3">${historyNotice}<p>해당 조문을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground"><a href="${LAW_GO_KR.LAW_VIEW}/${encodeURIComponent(cleanedLawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기</a></p></div>`,
      lawName: cleanedLawName, articleNumber: articleLabel,
    }
  }

  const lawArticle = convertUnitToLawArticle(targetUnit)
  const articleTitle = `구 ${cleanedLawName} ${lawArticle.joNum}${lawArticle.title ? ` (${lawArticle.title})` : ""}`
  const htmlContent = historyNotice + extractArticleText(lawArticle, false, cleanedLawName)

  debugLogger.success('[citation] 구법령 조문 모달 열기 완료', { lawName: cleanedLawName, articleLabel })
  return { title: articleTitle, html: htmlContent, lawName: cleanedLawName, articleNumber: lawArticle.joNum }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 현행법 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function fetchCurrentLawArticle(
  cleanedLawName: string,
  articleLabel: string,
  joCode: string,
  lawId: string | undefined,
  mst: string | undefined,
  isOldLawRequest: boolean,
  efYd?: string,
): Promise<ModalResult> {
  const identifierParams = new URLSearchParams()
  if (lawId) identifierParams.append("lawId", lawId)
  else if (mst) identifierParams.append("mst", mst)

  const eflawRes = await fetch(`/api/eflaw?${identifierParams.toString()}`)
  if (!eflawRes.ok) throw new Error(`HTTP ${eflawRes.status}`)

  const eflawJson = await eflawRes.json()
  const lawData = eflawJson?.법령
  const rawArticleUnits = lawData?.조문?.조문단위
  const articleUnits: RawUnit[] = Array.isArray(rawArticleUnits)
    ? rawArticleUnits
    : rawArticleUnits ? [rawArticleUnits] : []

  // 조문 번호 없으면 전문
  if (!hasArticle(articleLabel)) {
    const allUnits = articleUnits.filter(u => u?.조문여부 === "조문")
    const articles = allUnits.map(u => convertUnitToLawArticle(u))
    const allHtml = buildAllArticlesHtml(articles, cleanedLawName, false)
    return {
      title: `${cleanedLawName} 전문`,
      html: `<div class="space-y-2">${allHtml}</div>`,
      lawName: cleanedLawName, articleNumber: '',
    }
  }

  // 조문 검색
  const normalizedJo = joCode || ""
  const targetUnit = articleUnits.find(unit =>
    unit?.조문여부 === "조문" && typeof unit?.조문키 === "string" && (unit.조문키 as string).startsWith(normalizedJo)
  ) || articleUnits.find(unit => {
    const num = typeof unit?.조문번호 === "string" ? (unit.조문번호 as string).replace(/\D/g, "") : ""
    const targetNum = articleLabel.replace(/\D/g, "")
    return unit?.조문여부 === "조문" && num !== "" && targetNum !== "" && num === targetNum
  })

  if (!targetUnit) {
    return {
      title: `${cleanedLawName} ${articleLabel || ''}`.trim(),
      html: `<p>해당 조문을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="${LAW_GO_KR.LAW_VIEW}/${encodeURIComponent(cleanedLawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기</a></p>`,
      lawName: cleanedLawName, articleNumber: articleLabel,
    }
  }

  const lawArticle = convertUnitToLawArticle(targetUnit)
  const titlePrefix = isOldLawRequest ? '구 ' : ''
  const articleTitle = `${titlePrefix}${cleanedLawName} ${lawArticle.joNum}${lawArticle.title ? ` (${lawArticle.title})` : ""}`

  let htmlContent = extractArticleText(lawArticle, false, cleanedLawName)

  if (isOldLawRequest && htmlContent) {
    const dateInfo = efYd
      ? `${efYd.substring(0, 4)}. ${parseInt(efYd.substring(4, 6))}. ${parseInt(efYd.substring(6, 8))}.`
      : '과거'
    htmlContent = `<div class="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-sm text-amber-700 dark:text-amber-400">
      <strong>⚠️ 구법령 참조</strong>: 해당 조문은 ${dateInfo} 기준 연혁법령입니다. 아래는 <strong>현행법</strong> 내용이며, 개정으로 인해 내용이 다를 수 있습니다.
    </div>` + htmlContent
  }

  if (!htmlContent?.trim()) {
    return {
      title: articleTitle,
      html: lawGoKrFallback(cleanedLawName, articleLabel, '⚠️ 조문 내용을 불러올 수 없습니다.'),
      lawName: cleanedLawName, articleNumber: articleLabel,
    }
  }

  return { title: articleTitle, html: htmlContent, lawName: cleanedLawName, articleNumber: lawArticle.joNum }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 법령 검색 → lawId/mst 얻기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function searchLawByName(lawName: string): Promise<{ lawId?: string; mst?: string }> {
  const qs = new URLSearchParams({ query: lawName })
  const searchRes = await fetch(`/api/law-search?${qs.toString()}`)
  const searchXml = await searchRes.text()

  const parser = new DOMParser()
  const searchDoc = parser.parseFromString(searchXml, "text/xml")
  const allLaws = Array.from(searchDoc.querySelectorAll("law"))
  const normalizedSearchName = lawName.replace(/\s+/g, "")

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

  return {
    lawId: lawNode?.querySelector("법령ID")?.textContent || undefined,
    mst: lawNode?.querySelector("법령일련번호")?.textContent || undefined,
  }
}

export { extractJoCode, hasArticle as hasArticleLabel }
