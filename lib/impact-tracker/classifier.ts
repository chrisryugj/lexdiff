/**
 * AI 영향도 분류기 - OpenClaw 우선, Gemini 폴백
 *
 * 법령 변경사항의 영향도(critical/review/info)를 AI로 분류하고
 * 종합 요약을 생성한다.
 */

import { GoogleGenAI } from '@google/genai'
import { fetchFromOpenClaw, isOpenClawHealthy } from '@/lib/openclaw-client'
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

  // 1) OpenClaw 시도
  const openClawResult = await classifyViaOpenClaw(query, options?.signal)
  if (openClawResult) return openClawResult

  // 2) Gemini 폴백
  return classifyWithGemini(query, options?.apiKey)
}

/**
 * AI 엔진이 OpenClaw인지 Gemini인지 판별
 * (SSE에서 ai_source 이벤트 전송용)
 */
export async function getAISource(): Promise<'openclaw' | 'gemini'> {
  if (process.env.OPENCLAW_ENABLED === 'true' && await isOpenClawHealthy()) {
    return 'openclaw'
  }
  return 'gemini'
}

// ── OpenClaw 경로 ──

async function classifyViaOpenClaw(
  query: string,
  signal?: AbortSignal,
): Promise<ClassificationResult[] | null> {
  if (process.env.OPENCLAW_ENABLED !== 'true') return null
  if (!await isOpenClawHealthy()) return null

  try {
    let capturedAnswer = ''
    const send = (data: unknown) => {
      const evt = data as Record<string, unknown>
      if (evt.type === 'answer') {
        const d = evt.data as Record<string, unknown>
        capturedAnswer = String(d?.answer || '')
      }
    }

    const ok = await fetchFromOpenClaw(query, send, { abortSignal: signal })
    if (!ok || !capturedAnswer) return null

    return parseClassificationJSON(capturedAnswer)
  } catch {
    return null
  }
}

// ── Gemini 경로 ──

async function classifyWithGemini(
  query: string,
  apiKey?: string,
): Promise<ClassificationResult[]> {
  const key = apiKey || process.env.GEMINI_API_KEY
  if (!key) {
    console.error('[impact-classifier] GEMINI_API_KEY 미설정')
    return []
  }

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
  } catch (error) {
    console.error('[impact-classifier] Gemini 호출 실패:', error)
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

  // 1) OpenClaw 시도
  const openClawResult = await summarizeViaOpenClaw(query, options?.signal)
  if (openClawResult) return openClawResult

  // 2) Gemini 폴백
  return summarizeWithGemini(query, options?.apiKey)
}

async function summarizeViaOpenClaw(
  query: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (process.env.OPENCLAW_ENABLED !== 'true') return null
  if (!await isOpenClawHealthy()) return null

  try {
    let capturedAnswer = ''
    const send = (data: unknown) => {
      const evt = data as Record<string, unknown>
      if (evt.type === 'answer') {
        const d = evt.data as Record<string, unknown>
        capturedAnswer = String(d?.answer || '')
      }
    }

    const ok = await fetchFromOpenClaw(query, send, { abortSignal: signal })
    if (!ok || !capturedAnswer) return null

    return capturedAnswer.trim()
  } catch {
    return null
  }
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
  } catch (error) {
    console.error('[impact-classifier] Gemini 요약 실패:', error)
    return '요약 생성 중 오류가 발생했습니다.'
  }
}

// ── JSON 파싱 유틸 ──

function parseClassificationJSON(text: string): ClassificationResult[] | null {
  // JSON 배열 추출 (마크다운 코드블록 또는 순수 JSON)
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
