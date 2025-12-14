"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, AlertCircle, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface HwpViewerProps {
  /** HWP 파일 URL (프록시 경로) */
  fileUrl: string
  /** 다운로드 핸들러 */
  onDownload?: () => void
  /** 외부 링크 URL */
  externalUrl?: string
  /** 파일명 (표시용) */
  fileName?: string
}

type LoadingState = "loading" | "converting" | "done" | "error"

/**
 * HWP 파일 뷰어 컴포넌트
 * 서버 API를 통해 HWP를 HTML로 변환하여 표시
 */
export function HwpViewer({
  fileUrl,
  onDownload,
  externalUrl,
}: HwpViewerProps) {
  const [loadingState, setLoadingState] = useState<LoadingState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fileUrl) return

    let isMounted = true

    async function loadHwp() {
      try {
        setLoadingState("loading")
        setError(null)
        setHtml(null)

        // 서버 API로 HWP → HTML 변환 요청
        setLoadingState("converting")

        const response = await fetch("/api/hwp-to-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hwpUrl: fileUrl }),
        })

        const data = await response.json()

        if (!isMounted) return

        if (!data.success || !data.html) {
          throw new Error(data.error || "HWP 변환 실패")
        }

        setHtml(data.html)
        setLoadingState("done")
      } catch (err) {
        console.error("[HwpViewer] 렌더링 실패:", err)
        if (!isMounted) return

        setError(
          err instanceof Error
            ? err.message
            : "HWP 파일을 렌더링할 수 없습니다."
        )
        setLoadingState("error")
      }
    }

    loadHwp()

    return () => {
      isMounted = false
    }
  }, [fileUrl])

  // 로딩 중
  if (loadingState === "loading" || loadingState === "converting") {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {loadingState === "loading"
            ? "HWP 파일을 불러오는 중..."
            : "문서를 변환하는 중..."}
        </p>
      </div>
    )
  }

  // 에러 발생 시 폴백 UI
  if (loadingState === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-amber-500/60" />
        <div className="text-center">
          <p className="text-sm font-medium mb-1">
            HWP 뷰어를 사용할 수 없습니다
          </p>
          <p className="text-xs text-muted-foreground">
            {error || "복잡한 문서 형식은 지원되지 않을 수 있습니다."}
          </p>
        </div>
        <div className="flex gap-2">
          {onDownload && (
            <Button onClick={onDownload} size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              HWP 다운로드
            </Button>
          )}
          {externalUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                법제처에서 보기
              </a>
            </Button>
          )}
        </div>
      </div>
    )
  }

  // 렌더링 완료
  return (
    <ScrollArea className="h-[65vh]">
      <div
        ref={contentRef}
        className="hwp-content p-4 sm:p-6"
        style={{
          fontFamily: "Pretendard, 'Malgun Gothic', sans-serif",
          fontSize: "14px",
          lineHeight: "1.8",
        }}
        dangerouslySetInnerHTML={{ __html: html || "" }}
      />
      <style jsx global>{`
        .hwp-document {
          max-width: 100%;
        }
        .hwp-section {
          margin-bottom: 1rem;
        }
        .hwp-paragraph {
          margin-bottom: 0.5rem;
          word-break: keep-all;
        }
      `}</style>
    </ScrollArea>
  )
}
