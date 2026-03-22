/**
 * 조례 벤치마킹 — AI 비교 분석
 *
 * 검색된 조례들의 본문을 Gemini에 보내서 구조화된 비교표를 생성한다.
 */

import { GoogleGenAI } from '@google/genai'
import type { BenchmarkOrdinanceResult } from './types'
import { AI_CONFIG } from '@/lib/ai-config'

const MODEL = AI_CONFIG.gemini.standard

/** AI 비교 분석 결과 */
export interface BenchmarkAIAnalysis {
  comparisonTable: string    // Markdown 테이블
  highlights: string         // 주요 차이점 요약 (Markdown)
  analyzedAt: string
}

/** 캐시 */
const CACHE_TTL = 24 * 60 * 60 * 1000

function getCacheKey(keyword: string, orgCodes: string[]): string {
  return `benchmark-ai:${keyword}:${orgCodes.sort().join(',')}`
}

export function getCachedAIAnalysis(keyword: string, orgCodes: string[]): BenchmarkAIAnalysis | null {
  try {
    const raw = localStorage.getItem(getCacheKey(keyword, orgCodes))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.cachedAt > CACHE_TTL) {
      localStorage.removeItem(getCacheKey(keyword, orgCodes))
      return null
    }
    return data.analysis
  } catch { return null }
}

function setCacheAIAnalysis(keyword: string, orgCodes: string[], analysis: BenchmarkAIAnalysis): void {
  try {
    localStorage.setItem(getCacheKey(keyword, orgCodes), JSON.stringify({
      analysis,
      cachedAt: Date.now(),
    }))
  } catch { /* full */ }
}

/** 조례 본문 조회 */
async function fetchOrdinanceText(ordinanceSeq: string, signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(`/api/ordin?seq=${ordinanceSeq}`, { signal })
    if (!res.ok) return ''
    const data = await res.json()
    // 조문 content 합치기 (상위 N개)
    const articles = data.articles || []
    return articles
      .slice(0, 20) // 상위 20개 조문만
      .map((a: any) => `${a.joNum || ''} ${a.content || ''}`)
      .join('\n')
      .slice(0, 3000) // 토큰 제한
  } catch { return '' }
}

/**
 * 여러 조례를 AI로 비교 분석
 */
export async function analyzeOrdinances(
  keyword: string,
  ordinances: BenchmarkOrdinanceResult[],
  options?: { signal?: AbortSignal },
): Promise<BenchmarkAIAnalysis> {
  const orgCodes = ordinances.map(o => o.orgCode)

  // 캐시 체크
  const cached = getCachedAIAnalysis(keyword, orgCodes)
  if (cached) return cached

  // 상위 최대 8개 조례 본문 병렬 조회
  const targets = ordinances.slice(0, 8).filter(o => o.ordinanceSeq)
  const texts = await Promise.all(
    targets.map(async (o) => {
      const text = await fetchOrdinanceText(o.ordinanceSeq!, options?.signal)
      return { orgName: o.orgShortName, ordinanceName: o.ordinanceName, text }
    })
  )

  const validTexts = texts.filter(t => t.text.length > 50)
  if (validTexts.length < 2) {
    return {
      comparisonTable: '비교 가능한 조례 본문이 부족합니다.',
      highlights: '',
      analyzedAt: new Date().toISOString(),
    }
  }

  // Gemini 호출
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) {
    return {
      comparisonTable: 'API 키가 설정되지 않았습니다.',
      highlights: '',
      analyzedAt: new Date().toISOString(),
    }
  }

  const ordinanceList = validTexts.map((t, i) =>
    `### ${i + 1}. ${t.orgName} — ${t.ordinanceName}\n${t.text}`
  ).join('\n\n---\n\n')

  const prompt = `당신은 한국 지방자치법 전문가입니다. 아래 ${validTexts.length}개 지자체의 "${keyword}" 관련 조례를 비교 분석해 주세요.

## 요청
1. **비교표**: 핵심 비교 항목(지원금액, 자격요건, 신청기한, 소득기준, 거주요건 등)을 Markdown 테이블로 작성
2. **주요 차이점**: 3~5개 항목으로 요약 (선진 사례 포함)

## 조례 본문

${ordinanceList}

## 출력 형식
### 비교표
| 항목 | ${validTexts.map(t => t.orgName).join(' | ')} |
|------|${validTexts.map(() => '---').join('|')}|
(핵심 항목별 비교)

### 주요 차이점
- (차이점 1)
- (차이점 2)
...`

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    })

    const text = response.text || ''

    // 비교표와 하이라이트 분리
    const tableMatch = text.match(/### 비교표\s*([\s\S]*?)(?=### 주요|$)/)
    const highlightMatch = text.match(/### 주요 차이점\s*([\s\S]*)/)

    const analysis: BenchmarkAIAnalysis = {
      comparisonTable: tableMatch?.[1]?.trim() || text,
      highlights: highlightMatch?.[1]?.trim() || '',
      analyzedAt: new Date().toISOString(),
    }

    // 캐싱
    setCacheAIAnalysis(keyword, orgCodes, analysis)

    return analysis
  } catch (err: unknown) {
    return {
      comparisonTable: `AI 분석 오류: ${err instanceof Error ? err.message : String(err)}`,
      highlights: '',
      analyzedAt: new Date().toISOString(),
    }
  }
}
