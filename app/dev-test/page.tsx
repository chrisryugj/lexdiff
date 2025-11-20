/**
 * 개발용 통합 테스트 대시보드
 *
 * 모든 법령 파싱 API를 한 화면에서 테스트
 * - 관세법 제38조 (법률/시행령/시행규칙/행정규칙)
 * - 모달 테스트 (제39조)
 * - 신구법 대조 화면
 * - AI 검색 결과
 *
 * 사이드바: 법령 테스트 / AI 테스트
 */

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ComparisonModal } from "@/components/comparison-modal"
import { ReferenceModal } from "@/components/reference-modal"
import { LawViewer } from "@/components/law-viewer"
import { FileSearchRAGView } from "@/components/file-search-rag-view"
import {
  Loader2,
  FileText,
  Scale,
  BookOpen,
  Sparkles,
  ChevronRight,
  Brain,
  LayoutGrid,
  RefreshCw,
  Code
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { LawData } from "@/lib/law-types"

interface TestResult {
  name: string
  status: 'idle' | 'loading' | 'success' | 'error'
  data?: LawData
  error?: string
  duration?: number
  apiPath?: string
  files?: string[]
}

export default function DevTestPage() {
  const [activeTab, setActiveTab] = useState<'law' | 'ai'>('law')

  const [results, setResults] = useState<Record<string, TestResult>>({
    law: {
      name: '관세법 제38조 (법률)',
      status: 'idle',
      apiPath: '/api/eflaw?lawName=관세법&jo=제38조',
      files: [
        'app/api/eflaw/route.ts',
        'lib/law-json-parser.ts',
        'lib/law-types.ts',
        'components/law-viewer.tsx'
      ]
    },
    enforcement: {
      name: '관세법 시행령 제38조',
      status: 'idle',
      apiPath: '/api/eflaw?lawName=관세법 시행령&jo=제38조',
      files: [
        'app/api/eflaw/route.ts',
        'lib/law-json-parser.ts',
        'components/law-viewer.tsx'
      ]
    },
    rule: {
      name: '관세법 시행규칙 제38조',
      status: 'idle',
      apiPath: '/api/eflaw?lawName=관세법 시행규칙&jo=제38조',
      files: [
        'app/api/eflaw/route.ts',
        'lib/law-json-parser.ts',
        'components/law-viewer.tsx'
      ]
    },
    admin: {
      name: '납부기한의 연장 및 분할납부에 관한 고시',
      status: 'idle',
      apiPath: '/api/ordin?query=납부기한의 연장 및 분할납부에 관한 고시',
      files: [
        'app/api/ordin/route.ts',
        'lib/ordin-parser.ts',
        'components/law-viewer.tsx'
      ]
    },
  })

  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [aiSearchOpen, setAISearchOpen] = useState(false)

  // 관세법 제38조 법률 조회
  const testLaw = async () => {
    updateStatus('law', 'loading')
    const start = Date.now()

    try {
      const response = await fetch('/api/eflaw?lawName=관세법&jo=제38조')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      const duration = Date.now() - start

      updateStatus('law', 'success', data, undefined, duration)
    } catch (error: any) {
      updateStatus('law', 'error', undefined, error.message)
    }
  }

  // 관세법 시행령 제38조 조회
  const testEnforcement = async () => {
    updateStatus('enforcement', 'loading')
    const start = Date.now()

    try {
      const response = await fetch('/api/eflaw?lawName=관세법 시행령&jo=제38조')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      const duration = Date.now() - start

      updateStatus('enforcement', 'success', data, undefined, duration)
    } catch (error: any) {
      updateStatus('enforcement', 'error', undefined, error.message)
    }
  }

  // 관세법 시행규칙 제38조 조회
  const testRule = async () => {
    updateStatus('rule', 'loading')
    const start = Date.now()

    try {
      const response = await fetch('/api/eflaw?lawName=관세법 시행규칙&jo=제38조')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      const duration = Date.now() - start

      updateStatus('rule', 'success', data, undefined, duration)
    } catch (error: any) {
      updateStatus('rule', 'error', undefined, error.message)
    }
  }

  // 행정규칙 조회
  const testAdminRule = async () => {
    updateStatus('admin', 'loading')
    const start = Date.now()

    try {
      const response = await fetch('/api/ordin?query=납부기한의 연장 및 분할납부에 관한 고시')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      const duration = Date.now() - start

      updateStatus('admin', 'success', data, undefined, duration)
    } catch (error: any) {
      updateStatus('admin', 'error', undefined, error.message)
    }
  }

  // 모든 테스트 실행
  const runAllTests = async () => {
    await testLaw()
    await testEnforcement()
    await testRule()
    await testAdminRule()
  }

  // 전체 새로고침
  const refreshAll = () => {
    window.location.reload()
  }

  const updateStatus = (
    key: string,
    status: TestResult['status'],
    data?: LawData,
    error?: string,
    duration?: number
  ) => {
    setResults(prev => ({
      ...prev,
      [key]: { ...prev[key], status, data, error, duration }
    }))
  }

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'idle':
        return <Badge variant="outline">대기 중</Badge>
      case 'loading':
        return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />로딩 중</Badge>
      case 'success':
        return <Badge className="bg-green-500">성공</Badge>
      case 'error':
        return <Badge variant="destructive">실패</Badge>
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* 사이드바 */}
      <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-sm">
        <div className="sticky top-0 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6" />
            <h2 className="font-bold text-lg">테스트 대시보드</h2>
          </div>

          <Separator />

          {/* 탭 버튼 */}
          <div className="space-y-2">
            <Button
              variant={activeTab === 'law' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('law')}
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              법령 파싱 테스트
            </Button>

            <Button
              variant={activeTab === 'ai' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('ai')}
            >
              <Brain className="h-4 w-4 mr-2" />
              AI 기능 테스트
            </Button>
          </div>

          <Separator />

          {/* 액션 버튼 */}
          <div className="space-y-2">
            {activeTab === 'law' && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={runAllTests}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                전체 테스트 실행
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={refreshAll}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              새로고침
            </Button>
          </div>

          <Separator />

          {/* 정보 */}
          <div className="text-xs text-muted-foreground space-y-2">
            <p className="font-semibold">테스트 대상:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>관세법 제38조</li>
              <li>시행령/규칙</li>
              <li>행정규칙</li>
              <li>모달 시스템</li>
              <li>AI 검색</li>
            </ul>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">
                  {activeTab === 'law' ? '법령 파싱 테스트' : 'AI 기능 테스트'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeTab === 'law'
                    ? '모든 법령 파싱 API를 한 화면에서 테스트 (관세법 제38조)'
                    : 'AI 검색, 신구법 대조, 참조 모달 테스트'}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                실시간 모니터링
              </Badge>
            </div>
          </div>
        </header>

        <div className="px-8 py-8">
          {/* 법령 테스트 탭 */}
          {activeTab === 'law' && (
            <div className="space-y-6">
              {/* API 테스트 카드 */}
              <Card>
                <CardHeader>
                  <CardTitle>API 호출 테스트</CardTitle>
                  <CardDescription>관세법 제38조 관련 법령 조회</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(results).map(([key, result]) => (
                      <Card key={key} className="border-2">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                              {result.name}
                            </CardTitle>
                            {getStatusBadge(result.status)}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* 상태 정보 */}
                          <div className="space-y-1">
                            {result.duration && (
                              <p className="text-xs text-muted-foreground">
                                ⏱️ 응답시간: {result.duration}ms
                              </p>
                            )}
                            {result.data && (
                              <p className="text-xs text-muted-foreground">
                                📄 조문 수: {result.data.articleCount}개
                              </p>
                            )}
                            {result.error && (
                              <p className="text-xs text-destructive">
                                ❌ 에러: {result.error}
                              </p>
                            )}
                          </div>

                          {/* API 경로 */}
                          {result.apiPath && (
                            <div className="text-xs bg-muted p-2 rounded font-mono">
                              {result.apiPath}
                            </div>
                          )}

                          {/* 참조 파일 */}
                          {result.files && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                                <Code className="h-3 w-3" />
                                참조 파일 ({result.files.length})
                              </summary>
                              <ul className="mt-2 space-y-1 pl-4 text-muted-foreground">
                                {result.files.map((file, idx) => (
                                  <li key={idx} className="font-mono">• {file}</li>
                                ))}
                              </ul>
                            </details>
                          )}

                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              if (key === 'law') testLaw()
                              else if (key === 'enforcement') testEnforcement()
                              else if (key === 'rule') testRule()
                              else if (key === 'admin') testAdminRule()
                            }}
                            disabled={result.status === 'loading'}
                          >
                            {result.status === 'loading' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              '테스트 실행'
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 결과 표시 */}
              {Object.entries(results).map(([key, result]) => (
                result.data && (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{result.name}</span>
                        <Badge variant="outline">
                          {result.duration}ms
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        📄 {result.data.meta.lawTitle} | 조문 수: {result.data.articleCount}개
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LawViewer lawData={result.data} targetJo="" />
                    </CardContent>
                  </Card>
                )
              ))}
            </div>
          )}

          {/* AI 테스트 탭 */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>모달 및 AI 기능 테스트</CardTitle>
                  <CardDescription>참조 모달, 신구법 대조, AI 검색</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 참조 모달 */}
                    <Card className="border-2">
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          참조 모달
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          관세법 제39조를 모달로 표시
                        </p>

                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Code className="h-3 w-3" />
                            참조 파일 (4)
                          </summary>
                          <ul className="mt-2 space-y-1 pl-4 text-muted-foreground font-mono">
                            <li>• components/reference-modal.tsx</li>
                            <li>• app/api/eflaw/route.ts</li>
                            <li>• lib/law-json-parser.ts</li>
                            <li>• components/law-viewer.tsx</li>
                          </ul>
                        </details>

                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => setReferenceOpen(true)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          모달 열기
                        </Button>
                      </CardContent>
                    </Card>

                    {/* 신구법 대조 */}
                    <Card className="border-2">
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          신구법 대조
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          관세법 제38조 신구법 비교
                        </p>

                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Code className="h-3 w-3" />
                            참조 파일 (4)
                          </summary>
                          <ul className="mt-2 space-y-1 pl-4 text-muted-foreground font-mono">
                            <li>• components/comparison-modal.tsx</li>
                            <li>• app/api/oldnew/route.ts</li>
                            <li>• lib/oldnew-parser.ts</li>
                            <li>• components/law-viewer.tsx</li>
                          </ul>
                        </details>

                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => setComparisonOpen(true)}
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          대조 열기
                        </Button>
                      </CardContent>
                    </Card>

                  </div>
                </CardContent>
              </Card>

              {/* AI 검색 결과 (통합) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    AI 검색 (File Search RAG)
                  </CardTitle>
                  <CardDescription>
                    Google File Search 기반 실시간 AI 답변
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <details className="mb-4 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1 font-semibold">
                      <Code className="h-3 w-3" />
                      참조 파일 (5)
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4 text-muted-foreground font-mono">
                      <li>• components/file-search-rag-view.tsx</li>
                      <li>• lib/file-search-client.ts</li>
                      <li>• lib/citation-verifier.ts</li>
                      <li>• app/api/rag-stream/route.ts</li>
                      <li>• lib/ai-answer-processor.ts</li>
                    </ul>
                  </details>

                  <div className="border rounded-lg p-4 bg-card">
                    <FileSearchRAGView
                      initialQuery="관세법 제38조에 대해 알려줘"
                      onCitationClick={(lawName, articleNum) => {
                        console.log('Citation clicked:', { lawName, articleNum })
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {referenceOpen && (
        <ReferenceModal
          isOpen={referenceOpen}
          onClose={() => setReferenceOpen(false)}
          lawName="관세법"
          joLabel="제39조"
        />
      )}

      {comparisonOpen && (
        <ComparisonModal
          isOpen={comparisonOpen}
          onClose={() => setComparisonOpen(false)}
          lawName="관세법"
          joLabel="제38조"
        />
      )}
    </div>
  )
}
