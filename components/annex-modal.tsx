"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Icon } from "@/components/ui/icon"
import { CopyButton } from "@/components/ui/copy-button"
import { LegalMarkdownRenderer } from "@/components/legal-markdown-renderer"
import type { LawAnnex } from "@/lib/law-types"
import { getAnnexCache, setAnnexCache } from "@/lib/annex-cache"
import { parseAdminRuleList } from "@/lib/admrul-parser"

interface AnnexModalProps {
  isOpen: boolean
  onClose: () => void
  annexNumber: string // "1", "2의3" 등
  lawName: string
  lawId?: string
  hasHistory?: boolean
  onBack?: () => void
  onLawClick?: (lawName: string, article?: string) => void
}

type ViewMode = "markdown" | "pdf"
type LoadingState = "idle" | "fetching-list" | "fetching-pdf" | "converting" | "done" | "error"

/**
 * flSeq 추출 유틸리티
 */
function extractFlSeq(link: string): string {
  const match = link?.match(/flSeq=(\d+)/)
  return match?.[1] || ""
}

/**
 * 별표 번호에서 숫자만 추출 (매칭용)
 * "[별표 1]" → "1", "별표1" → "1", "별표 2의3" → "2의3"
 * "000100" (6자리 API 형식) → "1", "000203" → "2의3"
 */
function extractAnnexNum(text: string): string {
  if (!text) return ""

  // API 형식: 6자리 숫자 (000100 → 1, 000203 → 2의3, 000000 → "" 번호 없음)
  if (/^\d{6}$/.test(text)) {
    const main = parseInt(text.substring(0, 4), 10)
    const sub = parseInt(text.substring(4, 6), 10)
    if (main === 0 && sub === 0) return "" // 번호 없는 별표
    if (sub > 0) {
      return `${main}의${sub}`
    }
    return String(main)
  }

  // 텍스트 형식: "[별표 1]", "별표1" 등에서 숫자 추출
  const match = text.match(/(\d+)(?:의(\d+))?/)
  if (match) {
    return match[2] ? `${match[1]}의${match[2]}` : match[1]
  }
  return text
}

/**
 * 별지(서식) 식별 — 매처/Markdown 경로가 annexNumber에 "별지제N호서식" 문자열을 실어 종류를 구분한다.
 * (LinkMatch에 별표/별지 구분 필드가 없어 문자열 prefix가 곧 종류 마커)
 */
function isFormAnnexNumber(text: string): boolean {
  return /별지|서식/.test(text)
}

/** 모달 표시용 라벨: 별지("별지제N호서식")는 "별지 제N호서식", 별표는 "별표 N" */
function formatAnnexLabel(annexNumber: string): string {
  if (isFormAnnexNumber(annexNumber)) {
    return annexNumber
      .replace(/^별지제(\d+)호서식$/, "별지 제$1호서식")
      .replace(/^별지(\d+)(?:의(\d+))?$/, (_m, a, b) => (b ? `별지 ${a}의${b}` : `별지 ${a}`))
  }
  return `별표 ${annexNumber}`
}

/**
 * 묶음 별표 범위 매칭: annexName에 "[별표1~5]" 같은 범위가 있으면 targetNum 포함 여부 확인
 */
function matchesAnnexRange(annexName: string, targetNum: string): boolean {
  const num = parseInt(targetNum, 10)
  if (isNaN(num)) return false

  const rangePattern = /별표\s*(\d+)\s*[~\-]\s*(\d+)/
  const match = annexName.match(rangePattern)
  if (!match) return false

  const start = parseInt(match[1], 10)
  const end = parseInt(match[2], 10)
  return num >= start && num <= end
}

/**
 * 묶음 별표 마크다운에서 특정 별표 섹션만 추출
 * "## [별표 N]" 헤더 기준으로 분리
 */
function extractAnnexSection(markdown: string, targetNum: string): string {
  const num = parseInt(targetNum, 10)
  if (isNaN(num)) return markdown

  // "## [별표 N]" 또는 "## [별표N]" 헤더로 섹션 분리
  const escapedNum = String(num)
  const sectionPattern = new RegExp(
    `(##\\s*\\[별표\\s*${escapedNum}\\][\\s\\S]*?)(?=##\\s*\\[별표\\s*\\d|$)`
  )
  const match = markdown.match(sectionPattern)
  return match ? match[1].trim() : markdown
}

/** 가운뎃점 정규화 (·ㆍ･・ → ㆍ) — 법제처 API와 사용자 입력 차이 대응 */
const MIDDLE_DOT_RE = /[·\u00B7\u318D\u30FB\uFF65]/g
const normDots = (s: string) => s.replace(MIDDLE_DOT_RE, 'ㆍ')

export function AnnexModal({
  isOpen,
  onClose,
  annexNumber,
  lawName,
  lawId,
  hasHistory = false,
  onBack,
  onLawClick,
}: AnnexModalProps) {
  const [loadingState, setLoadingState] = useState<LoadingState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [annexData, setAnnexData] = useState<LawAnnex | null>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("markdown")
  const [fileType, setFileType] = useState<"pdf" | "hwp" | "hwpx" | "unknown">("unknown")
  const [fontSize, setFontSize] = useState(14)
  // 행정규칙(고시) 원문 링크 — admrul-search로 찾은 admRulSeq 기반 (없으면 통합검색)
  const [adminRuleUrl, setAdminRuleUrl] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const savedScrollRef = useRef<number>(0)

  // 표시용 별표/별지 라벨
  const annexLabel = formatAnnexLabel(annexNumber)

  // 조례 여부 판별 (자치법규)
  const isOrdinance = /조례/.test(lawName) ||
    /(특별시|광역시|도|시|군|구)\s+[가-힣]+\s*(조례|규칙)/.test(lawName)

  // 행정규칙(고시·훈령 등) 별표 판별 — NFPC/NFTC 화재안전기준 포함.
  // 행정규칙 별표는 법제처 OpenAPI에 본문 데이터가 없어 원문 링크로만 안내한다.
  const isAdminRule = !isOrdinance && !/시행령|시행규칙/.test(lawName) &&
    (/화재안전(성능|기술)기준|NFPC|NFTC/i.test(lawName) || /훈령|예규|고시|지침|내규/.test(lawName))

  // 원문 링크 (조례→자치법규, 행정규칙→admRulSeq 원문 또는 통합검색, 일반→법령)
  const molegUrl = isOrdinance
    ? `https://www.law.go.kr/자치법규/${encodeURIComponent(lawName)}`
    : isAdminRule
      ? (adminRuleUrl || `https://www.law.go.kr/LSW/lsAstSc.do?menuId=391&query=${encodeURIComponent(lawName)}`)
      : `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`

  // 폰트 크기 조절
  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 1, 28))
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 1, 11))


  // 파일 다운로드
  const handleDownload = useCallback(() => {
    if (!annexData?.pdfLink) return

    const flSeq = extractFlSeq(annexData.pdfLink)
    if (!flSeq) return

    // 파일명: 법령명 별표 번호 (별표명) - 확장자는 API에서 추가
    const annexNamePart = annexData.annexName
      ? ` (${annexData.annexName.replace(/[\\/:*?"<>|]/g, "")})`  // 파일명 금지 문자 제거
      : ""
    const filename = `${lawName} ${formatAnnexLabel(annexNumber)}${annexNamePart}`

    // API에 filename 쿼리 파라미터로 전달
    const downloadUrl = `/api/annex-pdf?flSeq=${flSeq}&filename=${encodeURIComponent(filename)}`

    // 새 탭으로 열어서 다운로드 (Content-Disposition 헤더가 처리)
    window.open(downloadUrl, '_blank')
  }, [annexData, lawName, annexNumber])

  // P1-LV-6: AbortController + 최신 요청 ID 가드
  const annexAbortRef = useRef<AbortController | null>(null)
  const annexReqIdRef = useRef(0)

  // 별표 데이터 가져오기
  const fetchAnnexData = useCallback(async (skipCache = false) => {
    // annexNumber 가 비어도(="별표 보기" 액션) lawName 만 있으면 진행 → 아래 폴백(3c)이
    // 같은 법령의 첫 별표를 띄운다. 과거엔 !annexNumber 가드가 폴백을 막아 빈 모달
    // dead-end 였음 (ANNEX-1).
    if (!lawName) return

    annexAbortRef.current?.abort()
    const ctrl = new AbortController()
    annexAbortRef.current = ctrl
    const reqId = ++annexReqIdRef.current
    const isStale = () => ctrl.signal.aborted || reqId !== annexReqIdRef.current

    setLoadingState("fetching-list")
    setError(null)
    setAnnexData(null)
    setMarkdown(null)

    // 행정규칙(NFPC/NFTC 등 고시) 별표: 법제처 OpenAPI에 본문 데이터가 없음.
    // law-annexes(법령 별표) 검색 시 빈/엉뚱한 결과가 나오므로, 원문 페이지 링크로 안내한다.
    if (isAdminRule) {
      try {
        const cleaned = lawName.replace(/[「」『』]/g, '').trim()
        const searchName = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim() || cleaned
        const sres = await fetch(`/api/admrul-search?query=${encodeURIComponent(searchName)}&display=20`, { signal: ctrl.signal })
        if (!isStale() && sres.ok) {
          const list = parseAdminRuleList(await sres.text())
          const norm = (s: string) => s.replace(/[\s·•‧]/g, '')
          const target = norm(cleaned)
          const match = list.find(r => norm(r.name) === target) || (list.length === 1 ? list[0] : undefined)
          if (match?.serialNumber) {
            setAdminRuleUrl(`https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=${match.serialNumber}`)
          }
        }
      } catch {
        // admrul-search 실패 → molegUrl 통합검색 fallback 유지
      }
      if (isStale()) return
      setError(`「${lawName}」은(는) 행정규칙(고시)으로, 별표 본문은 법제처 OpenAPI에서 제공되지 않습니다.\n아래 '법제처에서 보기'로 원문을 확인하세요.`)
      setLoadingState("error")
      return
    }

    try {
      // 1. 캐시 확인 (lawId 우선, 없으면 lawName으로 fallback)
      const cacheKey = lawId || lawName
      if (!skipCache && cacheKey) {
        const cached = await getAnnexCache(cacheKey, annexNumber)
        if (isStale()) return
        if (cached) {
          // 묶음 별표 캐시인 경우 요청 섹션만 추출
          const cachedMd = cached.annexName && matchesAnnexRange(cached.annexName, extractAnnexNum(annexNumber))
            ? extractAnnexSection(cached.markdown, extractAnnexNum(annexNumber))
            : cached.markdown
          setMarkdown(cachedMd)
          setAnnexData({
            annexId: "",
            annexNumber: cached.annexNumber,
            annexName: cached.annexName || "",
            annexKind: "1",
            lawName: cached.lawName,
            lawId: lawId || "",
            pdfLink: `/LSW/flDownload.do?flSeq=${cached.pdfFlSeq}`,
          })
          setLoadingState("done")
          return
        }
      }

      // 별지(서식) 여부 — 법제처는 "별지 제N호서식"을 별표종류 "서식"(knd=2)으로 분류한다.
      // (knd=2가 0건이면 law-annexes API가 knd 필터를 떼고 재조회 → 아래 종류 매칭으로 보정)
      const isForm = isFormAnnexNumber(annexNumber)

      // 2. 별표 목록 조회
      const res = await fetch(`/api/law-annexes?query=${encodeURIComponent(lawName)}&knd=${isForm ? '2' : '1'}`, { signal: ctrl.signal })
      if (!res.ok) {
        throw new Error("별표 목록을 불러올 수 없습니다")
      }

      const data = await res.json()
      if (isStale()) return
      const annexes: LawAnnex[] = data.annexes || []

      // 3. 별표 매칭 (lawName + annexNumber 우선, 번호만 매칭 후순위)
      const targetNum = extractAnnexNum(annexNumber)

      // 3a. lawName이 정확히 일치하는 별표 필터링
      const sameLawAnnexes = annexes.filter((a) =>
        normDots(a.lawName) === normDots(lawName) || normDots(a.lawName).includes(normDots(lawName)) || normDots(lawName).includes(normDots(a.lawName))
      )
      const searchPool = sameLawAnnexes.length > 0 ? sameLawAnnexes : annexes

      // 3b. 번호 매칭 (정확한 번호 → 범위 매칭 순)
      // 별지(서식)는 별표와 번호가 겹칠 수 있어 종류(별표종류 ≠ 별표="1")를 우선한다.
      let targetAnnex = searchPool.find((a) =>
        (!isForm || a.annexKind !== "1") && extractAnnexNum(a.annexNumber) === targetNum
      )
      // 종류 불명확 시 번호만이라도 일치 (별지인데 법제처가 "별표"로 분류한 드문 경우)
      if (!targetAnnex && isForm) {
        targetAnnex = searchPool.find((a) => extractAnnexNum(a.annexNumber) === targetNum)
      }

      // 3b-2. 범위 매칭: [별표1~5] 같은 묶음 별표에서 요청 번호가 범위 내인지 확인
      if (!targetAnnex && targetNum) {
        targetAnnex = searchPool.find((a) => matchesAnnexRange(a.annexName, targetNum))
      }

      // 3c. 폴백: 별지면 같은 법령의 첫 서식, 아니면 첫 별표 → 없으면 전체 첫 번째
      const finalAnnex = targetAnnex
        || (isForm ? searchPool.find((a) => a.annexKind !== "1") : null)
        || (sameLawAnnexes.length > 0 ? sameLawAnnexes[0] : null)
        || (annexes.length > 0 ? annexes[0] : null)

      if (!finalAnnex) {
        throw new Error(`「${lawName}」에서 별표를 찾을 수 없습니다.\n해당 법령에 별표가 없거나 API에서 제공되지 않을 수 있습니다.`)
      }

      setAnnexData(finalAnnex)

      // 4. 파일 타입 확인 및 마크다운 변환
      if (finalAnnex.pdfLink) {
        const flSeq = extractFlSeq(finalAnnex.pdfLink)

        // 4-1. 파일 타입 확인 (HEAD 요청으로 빠르게 확인)
        setLoadingState("converting")
        try {
          const fileCheckRes = await fetch(`/api/annex-pdf?flSeq=${flSeq}`, {
            method: "HEAD",
            signal: ctrl.signal,
          })
          if (isStale()) return
          const detectedFileType = fileCheckRes.headers.get("X-File-Type") as "pdf" | "hwp" | "hwpx" | "unknown" || "unknown"
          setFileType(detectedFileType)
        } catch {
          if (isStale()) return
          setFileType("pdf")
        }

        // 4-2. 마크다운 변환 시도 (HWPX와 PDF 모두 지원)
        const fileUrl = `/api/annex-pdf?flSeq=${flSeq}`

        const mdRes = await fetch("/api/annex-to-markdown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfUrl: fileUrl,
            annexNumber: formatAnnexLabel(annexNumber),
            lawName,
          }),
          signal: ctrl.signal,
        })
        if (isStale()) return

        // 묶음 별표 여부 판별 (범위 매칭으로 찾은 경우)
        const isBundledAnnex = finalAnnex.annexName && matchesAnnexRange(finalAnnex.annexName, targetNum)

        if (mdRes.ok) {
          const mdData = await mdRes.json()
          if (mdData.markdown) {
            // 묶음 별표면 요청한 섹션만 추출
            const finalMarkdown = isBundledAnnex
              ? extractAnnexSection(mdData.markdown, targetNum)
              : mdData.markdown
            setMarkdown(finalMarkdown)

            // 캐시 저장 (lawId 또는 lawName으로)
            const saveKey = lawId || finalAnnex.lawId || lawName
            if (saveKey) {
              await setAnnexCache(
                saveKey,
                annexNumber,
                mdData.markdown,
                flSeq,
                lawName,
                finalAnnex.annexName
              )
              // lawId가 있을 때 lawName 키로도 저장 (AI 답변에서 lawId 없이 열 때 캐시 히트)
              if (saveKey !== lawName) {
                await setAnnexCache(lawName, annexNumber, mdData.markdown, flSeq, lawName, finalAnnex.annexName)
              }
            }
          }
        } else {
          // 마크다운 변환 실패 시
          const errorData = await mdRes.json().catch(() => ({ error: "응답 파싱 실패" }))
          // 구 HWP 파일인 경우 다운로드만 제공
          if (errorData?.fileType === "old-hwp") {
            // 구 HWP 파일 - 다운로드만 제공 (아무 조치 없음)
          } else {
            // PDF는 원문 뷰로 전환
            setViewMode("pdf")
          }
        }
      }

      if (isStale()) return
      setLoadingState("done")
    } catch (err) {
      if (isStale() || (err as { name?: string })?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : "별표를 불러올 수 없습니다")
      setLoadingState("error")
    }
  }, [lawName, annexNumber, lawId, isAdminRule])

  // 모달 열릴 때 데이터 가져오기 (annexNumber 없는 "별표 보기"도 폴백으로 처리)
  useEffect(() => {
    if (isOpen && lawName) {
      fetchAnnexData()
    }
  }, [isOpen, annexNumber, lawName, fetchAnnexData])

  // 모달 열릴 때 스크롤 위치 저장, 닫힐 때 복원
  // P2-LV-9: 상태 초기화는 닫힘 애니메이션 종료 후로 지연 — 빈 화면 깜빡임 방지
  useEffect(() => {
    if (isOpen) {
      savedScrollRef.current = window.scrollY
      return
    }
    // 진행 중 fetch 취소
    annexAbortRef.current?.abort()
    const t = setTimeout(() => {
      setLoadingState("idle")
      setError(null)
      setAnnexData(null)
      setMarkdown(null)
      setViewMode("markdown")
      setFileType("unknown")
    }, 250)
    if (savedScrollRef.current > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollRef.current)
      })
    }
    return () => clearTimeout(t)
  }, [isOpen])

  // 로딩 메시지
  const getLoadingMessage = () => {
    switch (loadingState) {
      case "fetching-list":
        return "별표 목록을 불러오는 중..."
      case "fetching-pdf":
        return "PDF를 다운로드하는 중..."
      case "converting":
        return "마크다운으로 변환 중..."
      default:
        return "불러오는 중..."
    }
  }

  const isLoading = loadingState !== "done" && loadingState !== "error" && loadingState !== "idle"

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden [&>button]:hidden">
        {/* 헤더 - 1줄 레이아웃 */}
        <div className="flex items-center justify-between p-4 sm:p-6 pb-3 border-b border-border bg-background shrink-0 gap-3">
          {/* 왼쪽: 뒤로가기 + 제목 */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasHistory && onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
                onClick={onBack}
                title="이전 별표로 돌아가기"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
              </Button>
            )}
            <DialogTitle className="text-sm sm:text-base font-bold text-primary truncate">
              {lawName || '법령'} {annexLabel}
              {annexData?.annexName && (
                <span className="text-muted-foreground font-normal ml-1 hidden sm:inline">
                  ({annexData.annexName})
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {lawName || '법령'} {annexLabel} 내용
            </DialogDescription>
          </div>

          {/* 중앙: 컨트롤 버튼들 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 폰트 크기 조절 */}
            <div className="hidden sm:flex items-center gap-1 bg-background/50 rounded-md border border-border/50 px-1 py-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={decreaseFontSize}
                title="글자 작게"
              >
                <Icon name="minus" className="h-3 w-3" />
              </Button>
              <span className="text-xs w-8 text-center tabular-nums text-muted-foreground select-none">
                {fontSize}px
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={increaseFontSize}
                title="글자 크게"
              >
                <Icon name="plus" className="h-3 w-3" />
              </Button>
            </div>

            {/* 기능 버튼들 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { fetchAnnexData(true) }}
              disabled={isLoading}
              className="h-7 w-7 hidden sm:flex"
              title="캐시 무시 새로고침"
            >
              <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            {markdown && (
              <CopyButton
                getText={() => markdown}
                variant="ghost"
                className="h-7 w-7 hidden sm:flex"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              disabled={!annexData?.pdfLink}
              className="h-7 w-7 hidden sm:flex"
              title={fileType === "hwp" || fileType === "hwpx" ? "HWP 다운로드" : "PDF 다운로드"}
            >
              <Icon name="download" className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="h-7 w-7 hidden sm:flex"
              title="법제처 원문"
            >
              <a href={molegUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="external-link" className="w-3.5 h-3.5" />
              </a>
            </Button>
          </div>

          {/* 우측: 닫기 버튼 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onClose}
          >
            <Icon name="x" className="h-5 w-5" />
            <span className="sr-only">닫기</span>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-[50vh] gap-3">
            <Icon name="loader" className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{getLoadingMessage()}</p>
          </div>
        ) : loadingState === "error" ? (
          <div className="flex flex-col items-center justify-center h-[50vh] gap-4 px-4">
            <Icon name="alert-circle" className="w-12 h-12 text-destructive/60" />
            <p className="text-sm text-destructive text-center whitespace-pre-line">{error}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { fetchAnnexData() }}>
                <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
                다시 시도
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={molegUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="external-link" className="w-4 h-4 mr-2" />
                  법제처에서 보기
                </a>
              </Button>
            </div>
          </div>
        ) : fileType === "hwp" && !markdown ? (
          // 구 HWP 파일인 경우 (파싱 불가): 컴팩트한 레이아웃
          <div className="flex flex-col items-center justify-center py-8 gap-4 px-4">
            {/* HWP 아이콘 */}
            <div className="relative">
              <Icon name="file-text" className="w-16 h-16 text-blue-500/70" strokeWidth={1.5} />
              <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                HWP
              </span>
            </div>

            {/* 파일명 */}
            <div className="text-center">
              <p className="text-base font-medium mb-1">
                {lawName || '법령'} {annexLabel}
                {annexData?.annexName && ` (${annexData.annexName})`}
              </p>
              <p className="text-sm text-muted-foreground">
                구 HWP 파일은 브라우저에서 직접 볼 수 없습니다.
                <br />
                다운로드하여 한컴오피스로 열거나, 법제처에서 확인하세요.
              </p>
            </div>

            {/* 액션 버튼들 */}
            <div className="flex gap-3 flex-wrap justify-center">
              <Button asChild className="gap-2">
                <a href={`https://www.law.go.kr/LSW/flDownload.do?flSeq=${extractFlSeq(annexData?.pdfLink || "")}`} target="_blank" rel="noopener noreferrer">
                  <Icon name="download" className="w-4 h-4" />
                  다운로드
                </a>
              </Button>
              <Button variant="outline" asChild className="gap-2">
                <a href={molegUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="external-link" className="w-4 h-4" />
                  법제처에서 보기
                </a>
              </Button>
            </div>

            {/* 안내 메시지 */}
            <p className="text-xs text-muted-foreground/70 text-center">
              💡 Windows에서는 한컴오피스 뷰어를 설치하면 브라우저에서 바로 볼 수 있습니다.
            </p>
          </div>
        ) : markdown ? (
          // 마크다운 뷰 (텍스트만 표시)
          // flex-1 min-h-0: flex column 안에서 definite 높이를 받아야 Radix Viewport(height:100%)가
          // 해석되어 내부 스크롤이 동작함. max-h-[65vh]만으로는 높이가 indefinite라 스크롤 안 됨.
          <ScrollArea className="flex-1 min-h-0 max-h-[65vh]">
            <div
              ref={contentRef}
              className="p-4 sm:p-6"
              style={{ fontSize: `${fontSize}px`, lineHeight: "1.8" }}
            >
              <LegalMarkdownRenderer
                content={markdown}
                onLawClick={onLawClick}
                disabledLink={true}
                className="leading-relaxed [&_h2]:!mt-1 [&_h2]:!pt-0"
              />
            </div>
          </ScrollArea>
        ) : (
          // 마크다운 없으면 원문 안내
          <div className="flex flex-col items-center justify-center h-[50vh] gap-4 px-4">
            <Icon name="file-image" className="w-16 h-16 text-muted-foreground/60" />
            <div className="text-center">
              <p className="text-lg font-medium mb-1">
                {annexData?.annexName || annexLabel}
              </p>
              <p className="text-sm text-muted-foreground">
                {fileType === "hwp" || fileType === "hwpx" ? "HWP" : "PDF"} 원문을 확인하세요.
              </p>
            </div>
            <div className="flex gap-2">
              {annexData?.pdfLink && (
                <>
                  <Button asChild className="gap-2">
                    <a
                      href={`/api/annex-pdf?flSeq=${extractFlSeq(annexData.pdfLink)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name="external-link" className="w-4 h-4" />
                      새 탭에서 보기
                    </a>
                  </Button>
                  <Button variant="outline" onClick={handleDownload} className="gap-2">
                    <Icon name="download" className="w-4 h-4" />
                    다운로드
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
