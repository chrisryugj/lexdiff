/**
 * AI 영향도 분류기 - Gemini Flash Lite
 *
 * 법령 변경사항의 영향도(critical/review/info)를 AI로 분류하고
 * 종합 요약을 생성한다.
 */

import { GoogleGenAI } from '@google/genai'
import type { ClassificationInput, ClassificationResult, ImpactItem, ImpactSeverity } from './types'
import { AI_CONFIG } from '@/lib/ai-config'
import { debugLogger } from '@/lib/debug-logger'
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
      model: AI_CONFIG.gemini.lite,
      contents: query,
      config: {
        systemInstruction: buildClassificationSystemPrompt(),
        temperature: 0.1,
      },
    })
    const text = response.text || ''
    return parseClassificationJSON(text) || []
  } catch (error) {
    debugLogger.error('[impact-tracker] classifyWithGemini failed', {
      model: AI_CONFIG.gemini.lite,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
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

  const ai = new GoogleGenAI({ apiKey: key })
  // lite(preview) 과부하/gating 대비: standard 로 fallback.
  // 503/429 는 짧은 백오프로 재시도 (최대 2회).
  const models = [AI_CONFIG.gemini.lite, AI_CONFIG.gemini.standard]
  let lastError: unknown = null

  const isRetryable = (msg: string) => /"code":\s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg)
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: query,
          config: {
            systemInstruction: buildSummarySystemPrompt(),
            temperature: 0.3,
          },
        })
        const text = response.text?.trim()
        if (!text) {
          const finishReason = (response as { candidates?: Array<{ finishReason?: string }> })
            .candidates?.[0]?.finishReason
          debugLogger.error('[impact-tracker] summarizeWithGemini empty response', { model, finishReason })
          lastError = new Error(`empty response (finishReason=${finishReason ?? 'unknown'})`)
          break // 빈 응답은 재시도해도 동일 → 다음 모델로
        }
        return text
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        debugLogger.error('[impact-tracker] summarizeWithGemini failed', { model, attempt, message: msg })
        lastError = error
        if (attempt < 2 && isRetryable(msg)) {
          await sleep(600 * (attempt + 1)) // 600ms → 1200ms
          continue
        }
        break // 다음 모델로
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : '알 수 없는 오류'
  return `요약 생성 중 오류가 발생했습니다: ${msg}`
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
