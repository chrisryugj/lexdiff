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
  const [fileType, setFileType] = useState<"pdf" | "hwp" | "unknown">("unknown")
  const [fontSize, setFontSize] = useState(14)
  const contentRef = useRef<HTMLDivElement>(null)

  // 조례 여부 판별 (자치법규)
  const isOrdinance = /조례/.test(lawName) ||
    /(특별시|광역시|도|시|군|구)\s+[가-힣]+\s*(조례|규칙)/.test(lawName)

  // 원문 링크 (조례는 /자치법규/, 일반 법령은 /법령/)
  const molegUrl = isOrdinance
    ? `https://www.law.go.kr/자치법규/${encodeURIComponent(lawName)}`
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
    const filename = `${lawName} 별표 ${annexNumber}${annexNamePart}`

    // API에 filename 쿼리 파라미터로 전달
    const downloadUrl = `/api/annex-pdf?flSeq=${flSeq}&filename=${encodeURIComponent(filename)}`

    // 새 탭으로 열어서 다운로드 (Content-Disposition 헤더가 처리)
    window.open(downloadUrl, '_blank')
  }, [annexData, lawName, annexNumber])

  // 별표 데이터 가져오기
  const fetchAnnexData = useCallback(async () => {
    if (!lawName || !annexNumber) return

    setLoadingState("fetching-list")
    setError(null)
    setAnnexData(null)
    setMarkdown(null)

    try {
      // 1. 캐시 확인 (lawId 우선, 없으면 lawName으로 fallback)
      const cacheKey = lawId || lawName
      if (cacheKey) {
        const cached = await getAnnexCache(cacheKey, annexNumber)
        if (cached) {
          setMarkdown(cached.markdown)
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

      // 2. 별표 목록 조회
      const res = await fetch(`/api/law-annexes?query=${encodeURIComponent(lawName)}&knd=1`)
      if (!res.ok) {
        throw new Error("별표 목록을 불러올 수 없습니다")
      }

      const data = await res.json()
      const annexes: LawAnnex[] = data.annexes || []

      // 3. 별표 번호로 매칭 (숫자만 비교)
      const targetNum = extractAnnexNum(annexNumber)
      const targetAnnex = annexes.find((a) => {
        const num = extractAnnexNum(a.annexNumber)
        return num === targetNum
      })

      // 별표를 찾지 못하면 폴백
      const finalAnnex = targetAnnex || (annexes.length > 0 ? annexes[0] : null)

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
          })
          const detectedFileType = fileCheckRes.headers.get("X-File-Type") as "pdf" | "hwp" | "unknown" || "unknown"
          setFileType(detectedFileType)
        } catch {
          setFileType("pdf")
        }

        // 4-2. 마크다운 변환 시도 (HWPX와 PDF 모두 지원)
        const fileUrl = `/api/annex-pdf?flSeq=${flSeq}`

        const mdRes = await fetch("/api/annex-to-markdown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfUrl: fileUrl,
            annexNumber: `별표 ${annexNumber}`,
            lawName,
          }),
        })

        if (mdRes.ok) {
          const mdData = await mdRes.json()
          if (mdData.markdown) {
            setMarkdown(mdData.markdown)

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

      setLoadingState("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "별표를 불러올 수 없습니다")
      setLoadingState("error")
    }
  }, [lawName, annexNumber, lawId])

  // 모달 열릴 때 데이터 가져오기
  useEffect(() => {
    if (isOpen && annexNumber && lawName) {
      fetchAnnexData()
    }
  }, [isOpen, annexNumber, lawName, fetchAnnexData])

  // 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setLoadingState("idle")
      setError(null)
      setAnnexData(null)
      setMarkdown(null)
      setViewMode("markdown")
      setFileType("unknown")
    }
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
              {lawName || '법령'} 별표 {annexNumber}
              {annexData?.annexName && (
                <span className="text-muted-foreground font-normal ml-1 hidden sm:inline">
                  ({annexData.annexName})
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {lawName || '법령'} 별표 {annexNumber} 내용
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
              title={fileType === "hwp" ? "HWP 다운로드" : "PDF 다운로드"}
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
              <Button variant="outline" size="sm" onClick={fetchAnnexData}>
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
                {lawName || '법령'} 별표 {annexNumber}
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
          <ScrollArea className="h-[65vh]">
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
                {annexData?.annexName || `별표 ${annexNumber}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {fileType === "hwp" ? "HWP" : "PDF"} 원문을 확인하세요.
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
