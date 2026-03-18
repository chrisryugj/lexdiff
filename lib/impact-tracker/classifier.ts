/**
 * AI 영향도 분류기 - Gemini Flash Lite
 *
 * 법령 변경사항의 영향도(critical/review/info)를 AI로 분류하고
 * 종합 요약을 생성한다.
 */

import { GoogleGenAI } from '@google/genai'
import type { ClassificationInput, ClassificationResult, ImpactItem, ImpactSeverity } from './types'
import {
  buildClassificationQuery,
  buildClassificationSystemPrompt,
  buildSummaryQuery,
  buildSummarySystemPrompt,
} from './prompts'

// ── 영향도 분류 ──

export async function classifyImpact(
  changes: ClassificationInput[],
  options?: { signal?: AbortSignal; apiKey?: string },
): Promise<ClassificationResult[]> {
  if (changes.length === 0) return []

  const query = buildClassificationQuery(changes)
  return classifyWithGemini(query, options?.apiKey)
}

/**
 * AI 엔진 판별 (SSE ai_source 이벤트용)
 */
export async function getAISource(): Promise<'openclaw' | 'gemini'> {
  return 'gemini'
}

// ── Gemini 경로 ──

async function classifyWithGemini(
  query: string,
  apiKey?: string,
): Promise<ClassificationResult[]> {
  const key = apiKey || process.env.GEMINI_API_KEY
  if (!key) return []

  try {
    const ai = new GoogleGenAI({ apiKey: key })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: query,
      config: {
        systemInstruction: buildClassificationSystemPrompt(),
        temperature: 0.1,
      },
    })
    const text = response.text || ''
    return parseClassificationJSON(text) || []
  } catch {
    return []
  }
}

// ── 종합 요약 ──

export async function generateImpactSummary(
  items: ImpactItem[],
  dateRange: { from: string; to: string },
  options?: { signal?: AbortSignal; apiKey?: string },
): Promise<string> {
  if (items.length === 0) return '분석 기간 내 변경사항이 없습니다.'

  const query = buildSummaryQuery(items, dateRange)

  return summarizeWithGemini(query, options?.apiKey)
}

async function summarizeWithGemini(
  query: string,
  apiKey?: string,
): Promise<string> {
  const key = apiKey || process.env.GEMINI_API_KEY
  if (!key) return '요약을 생성할 수 없습니다 (API 키 미설정).'

  try {
    const ai = new GoogleGenAI({ apiKey: key })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: query,
      config: {
        systemInstruction: buildSummarySystemPrompt(),
        temperature: 0.3,
      },
    })
    return response.text?.trim() || '요약을 생성할 수 없습니다.'
  } catch {
    return '요약 생성 중 오류가 발생했습니다.'
  }
}

// ── JSON 파싱 유틸 ──

function parseClassificationJSON(text: string): ClassificationResult[] | null {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[]
    const results: ClassificationResult[] = []

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const jo = String(obj.jo || '')
      const severity = String(obj.severity || 'info')
      const reason = String(obj.reason || '')

      if (!['critical', 'review', 'info'].includes(severity)) continue
      results.push({ jo, severity: severity as ImpactSeverity, reason })
    }

    return results.length > 0 ? results : null
  } catch {
    return null
  }
}
