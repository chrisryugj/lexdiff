"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Loader2, Search, FileText, CheckCircle2, XCircle, ExternalLink, Eye } from "lucide-react"
import {
  parseAdminRulePurposeOnly,
  parseAdminRuleContent,
  checkLawArticleReference,
  type AdminRuleArticle,
  type AdminRuleContent,
} from "@/lib/admrul-parser"
import { parseHierarchyXML } from "@/lib/hierarchy-parser"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function TestAdminRulesPage() {
  const [lawName, setLawName] = useState("관세법")
  const [articleNumber, setArticleNumber] = useState("제38조")
  const [loading, setLoading] = useState(false)
  const [hierarchyRules, setHierarchyRules] = useState<Array<{ id: string; name: string; serialNumber?: string }>>([])
  const [processedCount, setProcessedCount] = useState(0)
  const [matchingRules, setMatchingRules] = useState<Array<{
    name: string
    id: string
    serialNumber?: string
    purpose: AdminRuleArticle
  }>>([])
  const [totalRules, setTotalRules] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [selectedRule, setSelectedRule] = useState<AdminRuleContent | null>(null)
  const [loadingFullContent, setLoadingFullContent] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const handleViewFullContent = async (rule: { id: string; serialNumber?: string; name: string }) => {
    setLoadingFullContent(true)
    setDialogOpen(true)

    try {
      const idParam = rule.serialNumber || rule.id
      const contentParams = new URLSearchParams({ ID: idParam })

      const contentResponse = await fetch(`/api/admrul?${contentParams.toString()}`)
      if (!contentResponse.ok) {
        throw new Error(`행정규칙 조회 실패: ${contentResponse.status}`)
      }

      const contentXml = await contentResponse.text()
      const fullContent = parseAdminRuleContent(contentXml)

      if (!fullContent) {
        throw new Error("행정규칙 파싱 실패")
      }

      setSelectedRule(fullContent)
    } catch (error: any) {
      console.error("[test-admin-rules] Error loading full content:", error)
      alert(`전체 내용 조회 실패: ${error.message}`)
      setDialogOpen(false)
    } finally {
      setLoadingFullContent(false)
    }
  }

  const getLawGoKrLink = (serialNumber?: string) => {
    if (!serialNumber) return null
    return `https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=${serialNumber}`
  }

  const handleSearch = async () => {
    setLoading(true)
    setHierarchyRules([])
    setProcessedCount(0)
    setTotalRules(0)
    setMatchingRules([])
    setLogs([])

    try {
      addLog(`🔍 "${lawName}" 법령 체계도 조회 시작...`)

      // Step 1: 법령 체계도에서 행정규칙 목록 가져오기
      const hierarchyParams = new URLSearchParams({
        lawName: lawName,
      })

      addLog(`📡 체계도 API 호출: /api/hierarchy?${hierarchyParams.toString()}`)

      const hierarchyResponse = await fetch(`/api/hierarchy?${hierarchyParams.toString()}`)
      if (!hierarchyResponse.ok) {
        throw new Error(`Hierarchy fetch failed: ${hierarchyResponse.status}`)
      }

      const hierarchyXml = await hierarchyResponse.text()
      addLog(`📄 체계도 XML 수신 완료 (${hierarchyXml.length} bytes)`)

      const hierarchy = parseHierarchyXML(hierarchyXml)

      if (!hierarchy) {
        addLog("❌ 체계도 파싱 실패")
        return
      }

      addLog(`✅ 법령명: ${hierarchy.lawName}`)

      const rules = hierarchy.adminRules || []
      addLog(`✅ 체계도에서 ${rules.length}개의 행정규칙 발견`)
      setHierarchyRules(rules)

      if (rules.length === 0) {
        addLog("⚠️ 체계도에 행정규칙이 없습니다")
        return
      }

      // Step 2: 각 행정규칙의 제1조(목적)만 조회하여 매칭 확인
      const rulesToFetch = rules
      setTotalRules(rulesToFetch.length)
      addLog(`📥 ${rulesToFetch.length}개 행정규칙 제1조 조회 및 매칭 확인 시작...`)

      const matching: Array<{ name: string; id: string; purpose: AdminRuleArticle }> = []

      for (let i = 0; i < rulesToFetch.length; i++) {
        const rule = rulesToFetch[i]
        setProcessedCount(i + 1)

        try {
          // serialNumber가 우선, 없으면 id 사용
          const idParam = rule.serialNumber || rule.id

          if (!idParam) {
            addLog(`⚠️ [${i + 1}/${rulesToFetch.length}] "${rule.name}": ID 정보 없음, 건너뛰기`)
            continue
          }

          const contentParams = new URLSearchParams({ ID: idParam })

          addLog(`  📡 [${i + 1}/${rulesToFetch.length}] "${rule.name}" 조회중...`)

          const contentResponse = await fetch(`/api/admrul?${contentParams.toString()}`)
          if (!contentResponse.ok) {
            const errorText = await contentResponse.text()
            addLog(`⚠️ "${rule.name}" 조회 실패 (${contentResponse.status})`)
            continue
          }

          const contentXml = await contentResponse.text()

          // 제1조(목적)만 빠르게 파싱
          const purposeData = parseAdminRulePurposeOnly(contentXml)

          if (!purposeData || !purposeData.purpose) {
            addLog(`  ⚠️ "${rule.name}": 제1조(목적) 없음`)
            continue
          }

          // 즉시 매칭 확인 (제목 + 제1조 내용)
          const isMatch = checkLawArticleReference(
            purposeData.purpose.content,
            lawName,
            articleNumber,
            purposeData.name // 행정규칙 제목도 전달
          )

          if (isMatch) {
            matching.push({
              name: purposeData.name,
              id: purposeData.id,
              serialNumber: rule.serialNumber,
              purpose: purposeData.purpose,
            })
            addLog(`  ✅ "${purposeData.name}": 매칭! (총 ${matching.length}개)`)
          } else {
            addLog(`  ❌ "${purposeData.name}": 미매칭`)
          }
        } catch (err: any) {
          addLog(`❌ "${rule.name}" 에러: ${err.message}`)
          console.error(`[test-admin-rules] Error fetching ${rule.name}:`, err)
        }
      }

      setMatchingRules(matching)

      if (matching.length > 0) {
        addLog(`🎉 ${matching.length}개의 매칭되는 행정규칙 발견!`)
      } else {
        addLog(`😞 매칭되는 행정규칙을 찾지 못했습니다.`)
      }
    } catch (error: any) {
      addLog(`❌ 오류 발생: ${error.message}`)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>행정규칙 매칭 테스트 (체계도 기반)</CardTitle>
          <CardDescription>
            법령 체계도에서 행정규칙 목록을 가져와 특정 법령 조문을 참조하는 행정규칙을 찾습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">법령명</label>
              <Input
                value={lawName}
                onChange={(e) => setLawName(e.target.value)}
                placeholder="예: 관세법"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">조문번호</label>
              <Input
                value={articleNumber}
                onChange={(e) => setArticleNumber(e.target.value)}
                placeholder="예: 제38조"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    검색 중...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    검색
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 검색 로그 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              실행 로그
              {loading && totalRules > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({processedCount}/{totalRules} 처리 중...)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-950 text-green-400 p-4 rounded-lg font-mono text-xs max-h-[500px] overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-slate-500">검색 버튼을 클릭하세요...</div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* 매칭 결과 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              매칭 결과 ({matchingRules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {matchingRules.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                매칭된 행정규칙이 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {matchingRules.map((rule, idx) => (
                  <Card key={idx} className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm flex-1">{rule.name}</CardTitle>
                        <Badge variant="default" className="shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          매칭
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs space-y-3">
                        <div>
                          <div className="font-semibold text-foreground">
                            {rule.purpose.number}
                            {rule.purpose.title && ` (${rule.purpose.title})`}
                          </div>
                          <div className="text-muted-foreground leading-relaxed mt-1">
                            {rule.purpose.content}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewFullContent(rule)}
                            className="flex-1"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            전체 보기
                          </Button>
                          {getLawGoKrLink(rule.serialNumber) && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="flex-1"
                            >
                              <a
                                href={getLawGoKrLink(rule.serialNumber)!}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                법령 사이트
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 체계도에서 가져온 행정규칙 목록 */}
      {hierarchyRules.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">체계도 행정규칙 목록 ({hierarchyRules.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {hierarchyRules.map((rule, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 border rounded text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-xs text-muted-foreground">
                      ID: {rule.id}
                      {rule.serialNumber && ` / 일련번호: ${rule.serialNumber}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 전체 내용 모달 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRule?.name}</DialogTitle>
            <DialogDescription>
              {selectedRule?.department && `${selectedRule.department} | `}
              {selectedRule?.publishDate && `발령일자: ${selectedRule.publishDate}`}
              {selectedRule?.effectiveDate && ` | 시행일자: ${selectedRule.effectiveDate}`}
            </DialogDescription>
          </DialogHeader>

          {loadingFullContent ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedRule ? (
            <div className="space-y-4">
              {selectedRule.articles.map((article, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="font-semibold text-sm">
                    {article.number}
                    {article.title && ` (${article.title})`}
                  </div>
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap pl-4 border-l-2 border-border">
                    {article.content}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
