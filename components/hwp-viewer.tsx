"use client"

import { Download, ExternalLink, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HwpViewerProps {
  /** HWP 파일 URL (프록시 경로, 예: /api/annex-pdf?flSeq=xxx) */
  fileUrl: string
  /** 다운로드 핸들러 */
  onDownload?: () => void
  /** 외부 링크 URL (법제처 원본) */
  externalUrl?: string
  /** 파일명 (표시용) */
  fileName?: string
}

/**
 * URL에서 flSeq 추출
 */
function extractFlSeq(url: string): string {
  const match = url.match(/flSeq=(\d+)/)
  return match?.[1] || ""
}

/**
 * HWP 파일 뷰어 컴포넌트
 *
 * HWP는 한컴오피스 독점 포맷으로 브라우저에서 직접 렌더링이 불가능합니다.
 * 다운로드 및 새 탭에서 열기 옵션을 제공합니다.
 */
export function HwpViewer({
  fileUrl,
  onDownload,
  externalUrl,
  fileName,
}: HwpViewerProps) {
  // flSeq 추출하여 법제처 원본 URL 생성
  const flSeq = extractFlSeq(fileUrl)
  const lawGoKrUrl = flSeq
    ? `https://www.law.go.kr/LSW/flDownload.do?flSeq=${flSeq}`
    : ""

  return (
    <div className="flex flex-col items-center justify-center w-full h-[50vh] gap-5 px-4">
      {/* HWP 아이콘 */}
      <div className="relative">
        <FileText className="w-20 h-20 text-blue-500/70" strokeWidth={1.5} />
        <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          HWP
        </span>
      </div>

      {/* 파일명 */}
      <div className="text-center">
        <p className="text-lg font-medium mb-1">
          {fileName || "HWP 문서"}
        </p>
        <p className="text-sm text-muted-foreground max-w-sm">
          HWP 파일은 브라우저에서 직접 볼 수 없습니다.
          <br />
          다운로드하여 한컴오피스로 열거나, 법제처에서 확인하세요.
        </p>
      </div>

      {/* 액션 버튼들 */}
      <div className="flex gap-3 flex-wrap justify-center">
        {lawGoKrUrl && (
          <Button asChild className="gap-2">
            <a href={lawGoKrUrl} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" />
              다운로드
            </a>
          </Button>
        )}
        {externalUrl && (
          <Button variant="outline" asChild className="gap-2">
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
              법제처에서 보기
            </a>
          </Button>
        )}
      </div>

      {/* 안내 메시지 */}
      <p className="text-xs text-muted-foreground/70 text-center mt-2">
        💡 Windows에서는 한컴오피스 뷰어를 설치하면 브라우저에서 바로 볼 수 있습니다.
      </p>
    </div>
  )
}
