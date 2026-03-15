/**
 * 조례 벤치마킹 AI 비교 분석 API
 *
 * POST /api/benchmark-analyze
 * Body: { keyword: string, ordinances: Array<{ orgShortName, ordinanceName, ordinanceSeq }> }
 * Response: { comparisonTable: string, highlights: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const MODEL = 'gemini-2.5-flash'

async function fetchOrdinanceText(ordinanceSeq: string): Promise<string> {
  try {
    const OC = process.env.LAW_OC || ''
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=ordin&ID=${ordinanceSeq}&type=JSON`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return ''
    const data = await res.json()

    // 조례 본문 추출
    const articles = data?.조례?.조문?.조문단위 || []
    if (!Array.isArray(articles)) return ''

    return articles
      .slice(0, 20)
      .map((a: any) => {
        const joNum = a?.조문번호 || ''
        const title = a?.조문제목 || ''
        const content = a?.조문내용 || ''
        return `제${joNum}조${title ? `(${title})` : ''} ${content}`
      })
      .join('\n')
      .slice(0, 3000)
  } catch { return '' }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 500 })
  }

  let keyword: string
  let ordinances: Array<{ orgShortName: string; ordinanceName: string; ordinanceSeq: string }>

  try {
    const body = await request.json()
    keyword = body.keyword
    ordinances = body.ordinances
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!keyword || !ordinances?.length || ordinances.length < 2) {
    return NextResponse.json({ error: '비교할 조례가 2개 이상 필요합니다.' }, { status: 400 })
  }

  // 상위 8개 조례 본문 병렬 조회
  const targets = ordinances.slice(0, 8)
  const texts = await Promise.all(
    targets.map(async (o) => {
      const text = await fetchOrdinanceText(o.ordinanceSeq)
      return { orgName: o.orgShortName, ordinanceName: o.ordinanceName, text }
    })
  )

  const validTexts = texts.filter(t => t.text.length > 50)
  if (validTexts.length < 2) {
    return NextResponse.json({
      comparisonTable: '비교 가능한 조례 본문이 부족합니다 (조례 본문 조회 실패).',
      highlights: '',
    })
  }

  const ordinanceList = validTexts.map((t, i) =>
    `### ${i + 1}. ${t.orgName} — ${t.ordinanceName}\n${t.text}`
  ).join('\n\n---\n\n')

  const prompt = `당신은 한국 지방자치법 전문가입니다. 아래 ${validTexts.length}개 지자체의 "${keyword}" 관련 조례를 비교 분석해 주세요.

## 요청
1. **비교표**: 핵심 비교 항목(지원금액, 자격요건, 신청기한, 소득기준, 거주요건 등)을 Markdown 테이블로 작성
2. **주요 차이점**: 3~5개 항목으로 요약 (선진 사례가 있다면 표시)

## 조례 본문

${ordinanceList}

## 출력 형식 (반드시 이 형식으로)
### 비교표
| 항목 | ${validTexts.map(t => t.orgName).join(' | ')} |
|------|${validTexts.map(() => '------').join('|')}|
(핵심 항목별 비교 — 없는 정보는 "미규정"으로 표기)

### 주요 차이점
- (차이점 요약)
`

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    })

    const text = response.text || ''

    const tableMatch = text.match(/### 비교표\s*([\s\S]*?)(?=### 주요|$)/)
    const highlightMatch = text.match(/### 주요 차이점\s*([\s\S]*)/)

    return NextResponse.json({
      comparisonTable: tableMatch?.[1]?.trim() || text,
      highlights: highlightMatch?.[1]?.trim() || '',
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: `AI 분석 실패: ${err.message}` },
      { status: 500 }
    )
  }
}
