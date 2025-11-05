"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function ThreeTierTestPage() {
  const [lawId, setLawId] = useState("")
  const [mst, setMst] = useState("5021") // 관세법 MST
  const [knd, setKnd] = useState("2") // 2: 위임조문
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState<any>(null)

  const handleTest = async () => {
    setLoading(true)
    setResult(null)
    setSelectedArticle(null)

    try {
      const params = new URLSearchParams()
      if (lawId) params.append("lawId", lawId)
      if (mst) params.append("mst", mst)
      params.append("knd", knd)

      const response = await fetch(`/api/three-tier-test?${params.toString()}`)
      const data = await response.json()

      setResult(data)
      console.log("테스트 결과:", data)
    } catch (error) {
      console.error("테스트 실패:", error)
      setResult({ error: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const articlesWithDelegations = result?.parsedData?.articles?.filter((a: any) => a.delegations.length > 0) || []

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="container mx-auto p-8 max-w-7xl">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
          3단비교 API 테스트 (조문별 파싱)
        </h1>

        {/* 입력 폼 */}
        <Card className="p-6 mb-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">법령 ID</label>
              <Input
                value={lawId}
                onChange={(e) => setLawId(e.target.value)}
                placeholder="예: 001556 (관세법)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">MST</label>
              <Input value={mst} onChange={(e) => setMst(e.target.value)} placeholder="법령 마스터 번호" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                비교 종류 (knd)
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <input type="radio" value="1" checked={knd === "1"} onChange={(e) => setKnd(e.target.value)} />
                  <span>인용조문 (1)</span>
                </label>
                <label className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <input type="radio" value="2" checked={knd === "2"} onChange={(e) => setKnd(e.target.value)} />
                  <span>위임조문 (2)</span>
                </label>
              </div>
            </div>
          </div>

          <Button onClick={handleTest} disabled={loading} className="w-full">
            {loading ? "테스트 중..." : "3단비교 API 테스트 (전체 조문 불러오기)"}
          </Button>
        </Card>

        {/* 결과 표시 */}
        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 왼쪽: 조문 목록 */}
            <Card className="p-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
                조문 목록 ({articlesWithDelegations.length}개)
              </h2>

              {result.parsedData && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {result.parsedData.meta.lawName}
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                    시행령: {result.parsedData.meta.sihyungryungName || "없음"}
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    시행규칙: {result.parsedData.meta.sihyungkyuchikName || "없음"}
                  </p>
                </div>
              )}

              <ScrollArea className="h-[600px]">
                <div className="space-y-2 pr-4">
                  {articlesWithDelegations.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center py-8">
                      위임조문이 있는 조문이 없습니다.
                    </p>
                  ) : (
                    articlesWithDelegations.map((article: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedArticle(article)}
                        className={`w-full p-3 rounded border-2 text-left transition-all ${
                          selectedArticle?.jo === article.jo
                            ? "bg-blue-100 dark:bg-blue-900 border-blue-500 dark:border-blue-400"
                            : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750"
                        }`}
                      >
                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          {article.joNum}
                          {article.title && <span className="text-gray-600 dark:text-gray-400 ml-2">{article.title}</span>}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          위임조문 {article.delegations.length}개 (
                          {article.delegations.map((d: any) => d.type).join(", ")})
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>

              {result.url && (
                <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">API 호출 URL:</p>
                  <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto text-gray-900 dark:text-gray-100 break-all">
                    {result.url}
                  </code>
                </div>
              )}
            </Card>

            {/* 오른쪽: 선택된 조문 상세 */}
            <Card className="p-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">조문 상세</h2>

              {!selectedArticle ? (
                <div className="flex items-center justify-center h-[600px] text-gray-500 dark:text-gray-400">
                  <p className="text-sm">← 왼쪽에서 조문을 선택하세요</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4 pr-4">
                    {/* 조문 기본 정보 */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-2">
                        {selectedArticle.joNum}
                        {selectedArticle.title && (
                          <span className="text-base font-normal text-gray-600 dark:text-gray-400 ml-2">
                            {selectedArticle.title}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">JO 코드: {selectedArticle.jo}</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {selectedArticle.content}
                      </p>
                    </div>

                    {/* 위임조문 목록 */}
                    <div>
                      <h4 className="font-semibold text-base mb-3 text-gray-900 dark:text-gray-100">
                        위임조문 ({selectedArticle.delegations.length}개)
                      </h4>
                      <div className="space-y-3">
                        {selectedArticle.delegations.map((del: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-4 rounded-lg border-2 ${
                              del.type === "시행령"
                                ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700"
                                : del.type === "시행규칙"
                                  ? "bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700"
                                  : "bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700"
                            }`}
                          >
                            <div className="flex items-start gap-2 mb-2">
                              <span
                                className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                  del.type === "시행령"
                                    ? "bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100"
                                    : del.type === "시행규칙"
                                      ? "bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100"
                                      : "bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100"
                                }`}
                              >
                                {del.type}
                              </span>
                              <div className="flex-1">
                                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                  {del.joNum || "조번호 없음"}
                                  {del.title && <span className="font-normal ml-2">{del.title}</span>}
                                </p>
                              </div>
                            </div>
                            {del.lawName && (
                              <p className="text-xs text-gray-700 dark:text-gray-300 mb-2 font-medium">
                                {del.lawName}
                              </p>
                            )}
                            {del.content && (
                              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                                {del.content}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>
        )}

        {/* 에러 표시 */}
        {result?.error && (
          <Card className="p-6 bg-red-50 dark:bg-red-950 border-2 border-red-300 dark:border-red-700">
            <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">오류 발생:</h3>
            <p className="text-sm text-red-800 dark:text-red-200">{String(result.error)}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
