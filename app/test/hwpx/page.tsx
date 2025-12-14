"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { parseHwpxToMarkdown, type HwpxParseResult } from "@/lib/hwpx-parser"
import JSZip from "jszip"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"

interface FileInfo {
  name: string
  size: number
}

interface AnnexItem {
  annexId: string
  annexNumber: string
  annexName: string
  fileLink?: string
  pdfLink?: string
}

export default function HwpxTestPage() {
  const [loading, setLoading] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [annexList, setAnnexList] = useState<AnnexItem[]>([])
  const [selectedAnnex, setSelectedAnnex] = useState<AnnexItem | null>(null)
  const [zipFiles, setZipFiles] = useState<FileInfo[]>([])
  const [parseResult, setParseResult] = useState<HwpxParseResult | null>(null)
  const [sectionXml, setSectionXml] = useState<string | null>(null)
  const [fileType, setFileType] = useState<string | null>(null)

  const lawName = "서울특별시 광진구 지방공무원 복무 조례"

  // 별표 목록 가져오기
  useEffect(() => {
    const fetchAnnexList = async () => {
      setLoadingList(true)
      try {
        const res = await fetch(`/api/law-annexes?query=${encodeURIComponent(lawName)}&knd=1`)
        if (!res.ok) throw new Error(`별표 목록 조회 실패: ${res.status}`)
        const data = await res.json()
        setAnnexList(data.annexes || [])
      } catch (err) {
        console.error("별표 목록 조회 에러:", err)
        setError(err instanceof Error ? err.message : "별표 목록 조회 실패")
      } finally {
        setLoadingList(false)
      }
    }
    fetchAnnexList()
  }, [])

  // flSeq 추출
  const extractFlSeq = (url?: string): string | null => {
    if (!url) return null
    const match = url.match(/flSeq=(\d+)/)
    return match?.[1] || null
  }

  const fetchAndParse = async (annex: AnnexItem) => {
    setSelectedAnnex(annex)
    setLoading(true)
    setError(null)
    setZipFiles([])
    setParseResult(null)
    setSectionXml(null)
    setFileType(null)

    const flSeq = extractFlSeq(annex.pdfLink) || extractFlSeq(annex.fileLink)
    if (!flSeq) {
      setError("파일 링크를 찾을 수 없습니다")
      setLoading(false)
      return
    }

    try {
      // 1. 파일 가져오기
      const res = await fetch(`/api/annex-pdf?flSeq=${flSeq}`)
      if (!res.ok) throw new Error(`파일 다운로드 실패: ${res.status}`)

      const detectedType = res.headers.get("X-File-Type")
      setFileType(detectedType)

      const buffer = await res.arrayBuffer()
      console.log("파일 크기:", buffer.byteLength, "타입:", detectedType)

      // 파일 타입 체크
      const bytes = new Uint8Array(buffer.slice(0, 4))
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50

      if (isPdf) {
        setError("PDF 파일입니다. HWPX 파서는 PDF를 지원하지 않습니다.")
        setLoading(false)
        return
      }

      if (!isZip) {
        setError(`지원하지 않는 파일 형식입니다. (매직 바이트: ${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')})`)
        setLoading(false)
        return
      }

      // 2. JSZip으로 ZIP 구조 확인 (디버깅용)
      const zip = await JSZip.loadAsync(buffer)
      const files: FileInfo[] = []
      zip.forEach((relativePath, file) => {
        files.push({
          name: relativePath,
          size: file._data?.uncompressedSize || 0,
        })
      })
      setZipFiles(files)

      // section0.xml 원본도 저장 (디버깅용)
      const sectionFile = zip.file("Contents/section0.xml")
      if (sectionFile) {
        const xml = await sectionFile.async("text")
        setSectionXml(xml)
      }

      // 3. HWPX 파서로 마크다운 변환
      const result = await parseHwpxToMarkdown(buffer)
      setParseResult(result)

      if (!result.success) {
        setError(result.error || "파싱 실패")
      }
    } catch (err) {
      console.error("파싱 에러:", err)
      setError(err instanceof Error ? err.message : "알 수 없는 에러")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">HWPX 파싱 테스트</h1>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>테스트 대상: {lawName}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">별표 목록 로딩 중...</p>
          ) : annexList.length === 0 ? (
            <p className="text-sm text-red-500">별표를 찾을 수 없습니다</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                총 {annexList.length}개의 별표가 있습니다. 테스트할 별표를 선택하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                {annexList.map((annex) => (
                  <Button
                    key={annex.annexId}
                    variant={selectedAnnex?.annexId === annex.annexId ? "default" : "outline"}
                    size="sm"
                    onClick={() => fetchAndParse(annex)}
                    disabled={loading}
                  >
                    {annex.annexNumber}
                  </Button>
                ))}
              </div>
              {selectedAnnex && (
                <div className="mt-3 p-3 bg-muted rounded text-sm">
                  <p><strong>선택:</strong> {selectedAnnex.annexNumber}</p>
                  <p className="text-muted-foreground">{selectedAnnex.annexName}</p>
                  <p className="text-xs font-mono mt-1">
                    flSeq: {extractFlSeq(selectedAnnex.pdfLink) || extractFlSeq(selectedAnnex.fileLink)}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <Card className="mb-4">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">파싱 중...</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-4 border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">에러</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap">{error}</pre>
          </CardContent>
        </Card>
      )}

      {fileType && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>파일 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <strong>감지된 타입:</strong> {fileType}
            </p>
          </CardContent>
        </Card>
      )}

      {zipFiles.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>ZIP 파일 구조</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm font-mono space-y-1">
              {zipFiles.map((f, i) => (
                <li key={i} className={f.name.includes("section") ? "text-blue-600 font-bold" : ""}>
                  {f.name} ({f.size} bytes)
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {parseResult?.success && (
        <Card className="mb-4 border-green-500">
          <CardHeader>
            <CardTitle className="text-green-600">마크다운 변환 결과</CardTitle>
          </CardHeader>
          <CardContent>
            {parseResult.meta && (
              <div className="text-xs text-muted-foreground mb-2">
                텍스트 노드: {parseResult.meta.textNodes}개 |
                단락: {parseResult.meta.paragraphs}개 |
                테이블: {parseResult.meta.tables}개
              </div>
            )}
            <Tabs defaultValue="rendered" className="w-full">
              <TabsList className="mb-2">
                <TabsTrigger value="rendered">렌더링</TabsTrigger>
                <TabsTrigger value="raw">원본 마크다운</TabsTrigger>
              </TabsList>
              <TabsContent value="rendered">
                <style>{`
                  .hwpx-sub-item {
                    padding-left: 2em;
                    text-indent: -1.5em;
                    margin: 0.25em 0;
                  }
                  .hwpx-num-item {
                    padding-left: 1.5em;
                    text-indent: -1.5em;
                    margin: 0.5em 0;
                  }
                `}</style>
                <div className="prose prose-sm dark:prose-invert max-w-none p-4 bg-background rounded border overflow-auto max-h-[500px]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      table: ({ children }) => (
                        <table className="border-collapse border border-border w-full">{children}</table>
                      ),
                      th: ({ children }) => (
                        <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">{children}</th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-border px-3 py-2">{children}</td>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-primary bg-muted/50 pl-4 py-2 my-4">{children}</blockquote>
                      ),
                    }}
                  >
                    {parseResult.markdown || ""}
                  </ReactMarkdown>
                </div>
              </TabsContent>
              <TabsContent value="raw">
                <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded overflow-auto max-h-96">
                  {parseResult.markdown}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {sectionXml && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>section0.xml (원본)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap bg-muted p-4 rounded overflow-auto max-h-96">
              {sectionXml.substring(0, 5000)}
              {sectionXml.length > 5000 && `\n\n... (${sectionXml.length - 5000} bytes 더 있음)`}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
