/**
 * 통합 검색 API
 * 법령 + 행정규칙 + 자치법규를 병렬로 검색
 */

import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

interface SearchResult {
  id: string
  name: string
  type: string
  date?: string
  link?: string
}

interface SearchAllResponse {
  query: string
  laws: {
    totalCount: number
    results: SearchResult[]
  }
  adminRules: {
    totalCount: number
    results: SearchResult[]
  }
  ordinances: {
    totalCount: number
    results: SearchResult[]
  }
}

// 법령 검색
async function searchLaws(query: string, apiKey: string, maxResults: number): Promise<{ totalCount: number; results: SearchResult[] }> {
  try {
    const params = new URLSearchParams({
      OC: apiKey,
      target: "law",
      type: "XML",
      query,
      display: maxResults.toString(),
    })

    const response = await fetch(`https://www.law.go.kr/DRF/lawSearch.do?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const xml = await response.text()
    if (xml.includes("<!DOCTYPE html")) throw new Error("HTML response")

    const totalMatch = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
    const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0

    const results: SearchResult[] = []
    const lawMatches = xml.matchAll(/<law[^>]*>([\s\S]*?)<\/law>/g)

    for (const match of lawMatches) {
      const content = match[1]
      const extract = (tag: string) => {
        // CDATA 지원
        const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
        const cdataMatch = content.match(cdataRegex)
        if (cdataMatch) return cdataMatch[1].trim()

        const m = content.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
        return m ? m[1].trim() : ""
      }

      results.push({
        id: extract("법령ID") || extract("MST"),
        name: extract("법령명한글") || extract("법령명"),
        type: "법령",
        date: extract("시행일자"),
        link: extract("법령상세링크")
      })
    }

    return { totalCount, results }
  } catch (error) {
    debugLogger.error("[search-all] Laws error:", error)
    return { totalCount: 0, results: [] }
  }
}

// 행정규칙 검색
async function searchAdminRules(query: string, apiKey: string, maxResults: number): Promise<{ totalCount: number; results: SearchResult[] }> {
  try {
    const params = new URLSearchParams({
      OC: apiKey,
      target: "admrul",
      type: "XML",
      query,
      display: maxResults.toString(),
    })

    const response = await fetch(`https://www.law.go.kr/DRF/lawSearch.do?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const xml = await response.text()
    if (xml.includes("<!DOCTYPE html")) throw new Error("HTML response")

    const totalMatch = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
    const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0

    const results: SearchResult[] = []
    const ruleMatches = xml.matchAll(/<admrul[^>]*>([\s\S]*?)<\/admrul>/g)

    for (const match of ruleMatches) {
      const content = match[1]
      const extract = (tag: string) => {
        const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
        const cdataMatch = content.match(cdataRegex)
        if (cdataMatch) return cdataMatch[1].trim()

        const m = content.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
        return m ? m[1].trim() : ""
      }

      results.push({
        id: extract("행정규칙ID") || extract("행정규칙일련번호"),
        name: extract("행정규칙명"),
        type: extract("행정규칙종류") || "행정규칙",
        date: extract("시행일자") || extract("발령일자"),
        link: extract("행정규칙상세링크")
      })
    }

    return { totalCount, results }
  } catch (error) {
    debugLogger.error("[search-all] AdminRules error:", error)
    return { totalCount: 0, results: [] }
  }
}

// 자치법규 검색
async function searchOrdinances(query: string, apiKey: string, maxResults: number): Promise<{ totalCount: number; results: SearchResult[] }> {
  try {
    const params = new URLSearchParams({
      OC: apiKey,
      target: "ordin",
      type: "XML",
      query,
      display: maxResults.toString(),
    })

    const response = await fetch(`https://www.law.go.kr/DRF/lawSearch.do?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const xml = await response.text()
    if (xml.includes("<!DOCTYPE html")) throw new Error("HTML response")

    const totalMatch = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
    const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0

    const results: SearchResult[] = []
    const ordinMatches = xml.matchAll(/<ordin[^>]*>([\s\S]*?)<\/ordin>/g)

    for (const match of ordinMatches) {
      const content = match[1]
      const extract = (tag: string) => {
        const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
        const cdataMatch = content.match(cdataRegex)
        if (cdataMatch) return cdataMatch[1].trim()

        const m = content.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
        return m ? m[1].trim() : ""
      }

      results.push({
        id: extract("자치법규ID"),
        name: extract("자치법규명"),
        type: extract("자치법규종류") || "자치법규",
        date: extract("시행일자"),
        link: extract("자치법규상세링크")
      })
    }

    return { totalCount, results }
  } catch (error) {
    debugLogger.error("[search-all] Ordinances error:", error)
    return { totalCount: 0, results: [] }
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const maxResults = parseInt(searchParams.get("maxResults") || "10", 10)

  if (!query) {
    return NextResponse.json(
      { error: "query 파라미터가 필요합니다" },
      { status: 400 }
    )
  }

  const apiKey = process.env.LAW_OC
  if (!apiKey) {
    return NextResponse.json(
      { error: "LAW_OC 환경변수가 설정되지 않았습니다" },
      { status: 500 }
    )
  }

  try {
    // 병렬 검색
    const [laws, adminRules, ordinances] = await Promise.all([
      searchLaws(query, apiKey, maxResults),
      searchAdminRules(query, apiKey, maxResults),
      searchOrdinances(query, apiKey, maxResults)
    ])

    const response: SearchAllResponse = {
      query,
      laws,
      adminRules,
      ordinances
    }

    return NextResponse.json(response)

  } catch (error) {
    debugLogger.error("[search-all] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "통합 검색 중 오류 발생" },
      { status: 500 }
    )
  }
}
