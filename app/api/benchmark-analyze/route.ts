/**
 * 조례 벤치마킹 AI 비교 분석 API
 *
 * POST /api/benchmark-analyze
 * Body: { keyword: string, ordinances: Array<{ orgShortName, orgName, ordinanceName, ordinanceSeq }> }
 * Response: { comparisonTable: string, highlights: string }
 *
 * OpenClaw(미니PC) 우선 → Gemini 폴백
 */

import { NextRequest, NextResponse } from 'next/server'
import { AI_CONFIG } from '@/lib/ai-config'
import { safeErrorResponse } from '@/lib/api-error'
import { getClientIP } from '@/lib/get-client-ip'
import { isQuotaExceeded, recordAIUsage, getUsageHeaders } from '@/lib/usage-tracker'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

// ── 조례 본문 조회 ──

async function fetchOrdinanceText(ordinanceSeq: string): Promise<string> {
  try {
    const OC = process.env.LAW_OC || ''
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=ordin&MST=${ordinanceSeq}&type=JSON`
    const res = await fetchWithTimeout(url, { next: { revalidate: 86400 } })
    if (!res.ok) return ''
    const data = await res.json()

    // JSON 구조: data.LawService.조문.조[] (각 조: 조문번호, 조제목, 조내용)
    const articles = data?.LawService?.조문?.조 || data?.자치법규?.조문?.조문단위 || data?.조례?.조문?.조문단위 || []
    const list = Array.isArray(articles) ? articles : [articles]
    if (list.length === 0) return ''

    type OrdinanceArticle = {
      조문여부?: string
      조내용?: string
      조문내용?: string
      조제목?: string
      조문제목?: string
    }
    return (list as OrdinanceArticle[])
      .filter((a) => a?.조문여부 === 'Y' || a?.조문여부 === '조문' || a?.조내용 || a?.조문내용)
      .map((a) => {
        const title = a?.조제목 || a?.조문제목 || ''
        const content = a?.조내용 || a?.조문내용 || ''
        return `${title ? `(${title}) ` : ''}${content}`
      })
      .join('\n')
  } catch { return '' }
}

// 프롬프트 인젝션 방어: 마크다운 코드 fence, 특수 명령형 토큰을 무력화
function sanitizeForPrompt(s: string, maxLen = 2000): string {
  if (!s) return ''
  return s
    .replace(/```/g, '`\u200b``') // fence 분해
    .replace(/<\|[^|>]*\|>/g, '') // GPT/LLama 특수 토큰
    .replace(/\r/g, '')
    .slice(0, maxLen)
    .trim()
}

// ── 프롬프트 빌드 ──

function buildPrompt(keyword: string, texts: Array<{ orgName: string; ordinanceName: string; text: string }>, focus?: string): string {
  const safeKeyword = sanitizeForPrompt(keyword, 200)
  const safeTexts = texts.map(t => ({
    orgName: sanitizeForPrompt(t.orgName, 60),
    ordinanceName: sanitizeForPrompt(t.ordinanceName, 200),
    text: sanitizeForPrompt(t.text, 20000),
  }))
  const ordinanceList = safeTexts.map((t, i) =>
    `### ${i + 1}. ${t.orgName} — ${t.ordinanceName}\n${t.text}`
  ).join('\n\n---\n\n')

  const focusInstruction = focus
    ? `\n\n**비교 포커스**: "${sanitizeForPrompt(focus, 500)}" — 이 관점을 중심으로 관련 조항을 집중 비교하세요. 다른 항목도 포함하되 이 포커스에 가중치를 두세요.`
    : ''

  return `당신은 한국 지방자치법 비교분석 전문가입니다.

## 과제
아래 ${safeTexts.length}개 지자체의 "${safeKeyword}" 관련 조례 **전문**을 읽고 비교 분석하세요.${focusInstruction}

## 분석 방법
1. 조례 내용을 통독한 뒤, **이 주제에서 실제로 중요한 비교 축 5~8개**를 직접 도출하세요 (하드코딩된 항목 없음 — 주제에 따라 유동적으로 판단).
2. 각 비교 축에 대해 지자체별 규정 내용을 정리하세요.
3. 한 지자체에만 있는 독특한 조항이 있으면 반드시 포함하세요.

## 조례 전문

${ordinanceList}

## 출력 형식 (반드시 이 형식)
### 비교표
| 비교 항목 | ${safeTexts.map(t => t.orgName).join(' | ')} |
|------|${safeTexts.map(() => '------').join('|')}|
(각 항목별 실제 규정 내용 요약. 해당 규정이 없으면 "미규정")

### 주요 차이점
- 핵심 차이 3~5개 (어느 지자체가 더 상세하거나 선진적인 규정을 두고 있는지 포함)`
}

// ── 응답 파싱 ──

function parseAnalysisResponse(text: string): { comparisonTable: string; highlights: string } {
  const tableMatch = text.match(/### 비교표\s*([\s\S]*?)(?=### 주요|$)/)
  const highlightMatch = text.match(/### 주요 차이점\s*([\s\S]*)/)
  return {
    comparisonTable: tableMatch?.[1]?.trim() || text,
    highlights: highlightMatch?.[1]?.trim() || '',
  }
}

// ── Gemini ──

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.')

  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: AI_CONFIG.gemini.standard,
    contents: prompt,
  })
  return response.text || ''
}

// ── 메인 핸들러 ──

export async function POST(request: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(request)
  if (await isQuotaExceeded(clientIP)) {
    return NextResponse.json(
      { error: '일일 AI 사용량 초과. 내일 다시 시도해주세요.' },
      { status: 429, headers: await getUsageHeaders(clientIP) },
    )
  }

  let keyword: string
  let focus: string | undefined
  let ordinances: Array<{ orgShortName: string; orgName?: string; ordinanceName: string; ordinanceSeq: string }>

  try {
    const body = await request.json()
    keyword = body.keyword
    focus = body.focus || undefined
    ordinances = body.ordinances
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!keyword || !ordinances?.length || ordinances.length < 2 || ordinances.length > 8) {
    return NextResponse.json({ error: '비교할 조례는 2~8개여야 합니다.' }, { status: 400 })
  }

  if (typeof keyword !== 'string' || keyword.length > 200) {
    return NextResponse.json({ error: 'keyword는 200자 이하 문자열이어야 합니다.' }, { status: 400 })
  }
  if (focus !== undefined && (typeof focus !== 'string' || focus.length > 500)) {
    return NextResponse.json({ error: 'focus는 500자 이하 문자열이어야 합니다.' }, { status: 400 })
  }

  // 각 ordinance 필드 strict 검증
  const isValidOrd = (o: unknown): boolean => {
    if (!o || typeof o !== 'object') return false
    const x = o as Record<string, unknown>
    return (
      typeof x.ordinanceSeq === 'string' && /^\d{1,12}$/.test(x.ordinanceSeq) &&
      typeof x.orgShortName === 'string' && x.orgShortName.length > 0 && x.orgShortName.length <= 60 &&
      (x.orgName === undefined || (typeof x.orgName === 'string' && x.orgName.length <= 60)) &&
      typeof x.ordinanceName === 'string' && x.ordinanceName.length > 0 && x.ordinanceName.length <= 200
    )
  }
  if (!ordinances.every(isValidOrd)) {
    return NextResponse.json({ error: '조례 항목 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  // 사용량 선예약 (S6: bypass 차단)
  await recordAIUsage(clientIP)

  // 조례 본문 병렬 조회 (상위 8개)
  const targets = ordinances.slice(0, 8)
  const texts = await Promise.all(
    targets.map(async (o) => {
      const text = await fetchOrdinanceText(o.ordinanceSeq)
      return { orgName: o.orgName || o.orgShortName, ordinanceName: o.ordinanceName, text }
    })
  )

  const validTexts = texts.filter(t => t.text.length > 50)
  if (validTexts.length < 2) {
    return NextResponse.json({
      comparisonTable: '비교 가능한 조례 본문이 부족합니다 (조례 본문 조회 실패).',
      highlights: '',
    })
  }

  const prompt = buildPrompt(keyword, validTexts, focus)

  try {
    const geminiAnswer = await callGemini(prompt)
    return NextResponse.json(parseAnalysisResponse(geminiAnswer), { headers: await getUsageHeaders(clientIP) })
  } catch (err: unknown) {
    return safeErrorResponse(err, "AI 분석 실패")
  }
}
