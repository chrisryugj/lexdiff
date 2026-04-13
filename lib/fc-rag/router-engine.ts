/**
 * FC-RAG S1 Router — Gemini 3.1 Flash-Lite 기반 경량 분류기 + 도구 플래너
 *
 * 목적: 기존 regex 분류(inferComplexity/inferQueryType/detectDomain) 를 대체하고,
 *       S2(Gemini 3 Flash) 엔진이 실행할 도구 플랜을 선제 생성한다.
 *       S2는 플랜대로 도구를 pre-fetch → maxTurns를 expectedTurns 로 축소 → 시간·토큰 감축.
 *
 * ── 설계 원칙 ──
 *   - 초경량: Flash-Lite + thinkingBudget=0 + JSON 모드 + 3s 타임아웃
 *   - 안전: 파싱/네트워크/타임아웃 실패 시 null 반환 → 호출자가 regex fallback
 *   - 검증: LLM이 반환한 도구명은 TOOLS 레지스트리로 allow-list 검증 (할루시네이션 방어)
 *   - 최소 컨텍스트: 도구 카탈로그는 TIER_0 + chain_* 만 노출 (~16개, ~400토큰)
 *
 * 20% 해시 롤아웃 분기는 gemini-engine.ts 쪽에서 처리. 이 파일은 순수 라우터.
 */

import { GoogleGenAI } from '@google/genai'
import { AI_CONFIG } from '@/lib/ai-config'
import { TOOLS } from './tool-registry'
import type { LegalDomain } from './tool-tiers'
import type { LegalQueryType, QueryComplexity } from './engine-shared'

// ─── 타입 ───

export interface RouterToolCall {
  name: string
  args: Record<string, unknown>
  rationale?: string
}

export interface RouterPlan {
  complexity: QueryComplexity
  queryType: LegalQueryType
  domain: LegalDomain | 'general'
  toolPlan: RouterToolCall[]
  expectedTurns: 1 | 2 | 3
  reasoning?: string
}

// ─── 설정 ───

const ROUTER_TIMEOUT_MS = 5_000
const ROUTER_MAX_TOOLS_IN_PLAN = 3

/**
 * 라우터가 선택 가능한 도구 화이트리스트.
 *
 * 🔴 중요: 여기 포함된 도구는 **모두 {query: string} 단일 파라미터만으로 작동**해야 한다.
 *         get_batch_articles(mst 필요), get_law_text(jo 필요), get_decision_text(id 필요) 같은
 *         복잡한 args 도구는 Router가 args를 임의 생성하면 실행 실패 → 제외.
 *         이런 도구가 필요하면 S2 가 일반 턴에서 search 후 받은 MST/ID로 호출한다.
 *
 * args 는 validateAndNormalize 에서 강제로 {query: originalQuery}로 덮어써짐 (할루시네이션 방어).
 */
const ROUTER_TOOL_CATALOG: Array<{ name: string; hint: string }> = [
  // 핵심 검색 (모두 {query}만)
  { name: 'search_ai_law', hint: '자연어 법령·조문 의미 검색 (첫 도구로 권장, 가장 범용)' },
  { name: 'search_law', hint: '법령명을 정확히 알 때 MST 확인용' },
  { name: 'search_ordinance', hint: '자치법규 검색 (지역명이 query에 포함되어야 효과)' },
  { name: 'search_admin_rule', hint: '훈령/예규/고시 검색' },
  // Chain — 복합 질문용 (모두 {query}만)
  { name: 'chain_full_research', hint: '종합 리서치 (AI검색+법령+판례+해석례 병렬)' },
  { name: 'chain_dispute_prep', hint: '쟁송/불복 질문 (판례+행정심판+도메인 결정)' },
  { name: 'chain_procedure_detail', hint: '절차/비용/신청 질문 (법령+3단+별표)' },
  { name: 'chain_action_basis', hint: '처분/허가 근거 (3단+해석례+판례+심판)' },
  { name: 'chain_law_system', hint: '법체계 파악 (3단+조문+별표)' },
  { name: 'chain_amendment_track', hint: '개정/변경 추적 (신구대조+이력)' },
  { name: 'chain_ordinance_compare', hint: '조례 비교 연구' },
]

const ALLOWED_TOOL_NAMES = new Set(ROUTER_TOOL_CATALOG.map(t => t.name))

// TOOLS 레지스트리에 실제 존재하는 도구만 최종 허용 (이중 방어)
const REGISTERED_TOOL_NAMES = new Set(TOOLS.map(t => t.name))

// ─── 시스템 프롬프트 (고정 — 향후 Context Cache 적용 가능) ───

const ROUTER_SYSTEM_PROMPT = `당신은 한국 법령 질의를 경량 모델로 사전 분류하고 도구 실행 플랜을 만드는 라우터다.

## 출력 형식 (JSON only, 다른 텍스트 금지)
{
  "complexity": "simple" | "moderate" | "complex",
  "queryType": "definition" | "requirement" | "procedure" | "comparison" | "application" | "consequence" | "scope" | "exemption",
  "domain": "general" | "tax" | "customs" | "labor" | "privacy" | "competition" | "constitutional" | "admin" | "public_servant" | "housing" | "environment" | "construction" | "civil_service" | "medical" | "education" | "finance" | "military",
  "toolPlan": [
    { "name": "<tool_name>", "rationale": "<짧은 이유>" }
  ],
  "expectedTurns": 1 | 2 | 3,
  "reasoning": "<1~2문장>"
}

## 분류 기준
- **complexity**: simple(조문 1개/정의), moderate(벌칙·절차·비교 1개 축), complex(여러 법령/판례/개정 이력/복합 쟁점)
- **queryType**: 질문 의도 (정의/요건/절차/비교/적용/불이익/범위/면제)
- **domain**: 질의 주요 도메인. 애매하면 "general"

## toolPlan 규칙 (최대 3개)
- 🔴 **args 필드는 출력하지 말 것** — 시스템이 자동으로 원 질의를 args 로 주입한다.
- 🔴 **tool name만 선택**. 카탈로그에 없는 이름 금지.
- 복합 질문 → chain_* 1개로 시작. chain 호출 시 중복 커버되는 다른 도구 넣지 말 것.
- 단순 정의/조문 질문 → search_ai_law 1개면 충분.
- 법령명이 명확하고 조문번호가 있으면 search_law 1개.
- 조례 관련이면 search_ordinance, 훈령/예규면 search_admin_rule.
- 확신 없으면 toolPlan 빈 배열 + expectedTurns=3 으로 S2 에 위임.

## expectedTurns (이 플랜 후 S2 가 추가로 필요한 LLM 턴 수)
- simple → 1
- moderate → 2
- complex → 2 or 3

## 도구 카탈로그 (모두 {query} 단일 파라미터로 작동)
${ROUTER_TOOL_CATALOG.map(t => `- ${t.name}: ${t.hint}`).join('\n')}

## 금지
- JSON 외 텍스트(설명, 마크다운 fence) 출력 금지.
- 카탈로그에 없는 도구명 출력 금지.
- args 필드 출력 금지.`

// ─── Public API ───

/**
 * 질의를 Gemini 3.1 Flash-Lite에 보내 라우팅 플랜을 생성한다.
 * 실패(타임아웃/파싱/네트워크) 시 null 반환 → 호출자가 regex fallback.
 */
export async function routeQuery(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RouterPlan | null> {
  if (!apiKey) return null
  if (signal?.aborted) return null

  const ai = new GoogleGenAI({ apiKey })
  const model = AI_CONFIG.gemini.lite

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const genPromise = ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        systemInstruction: ROUTER_SYSTEM_PROMPT,
        temperature: 0,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
        // Flash-Lite thinking budget 0 → 즉시 응답
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`S1 router timeout (${ROUTER_TIMEOUT_MS}ms)`)), ROUTER_TIMEOUT_MS)
    })

    const response = await Promise.race([genPromise, timeoutPromise])
    if (signal?.aborted) return null

    // Gemini 응답에서 첫 번째 text part 추출
    const parts = response.candidates?.[0]?.content?.parts ?? []
    const jsonText = parts
      .map(p => (p as { text?: string }).text ?? '')
      .join('')
      .trim()

    if (!jsonText) return null

    const parsed = parseRouterResponse(jsonText)
    if (!parsed) return null

    return validateAndNormalize(parsed, query)
  } catch {
    // 타임아웃/네트워크/파싱/SDK — 어떤 실패든 조용히 null 반환
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ─── 파싱 + 검증 ───

function parseRouterResponse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // 응답에 코드펜스가 포함된 경우 벗겨서 재시도
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    if (cleaned !== text) {
      try { return JSON.parse(cleaned) } catch { /* fall through */ }
    }
    return null
  }
}

const VALID_COMPLEXITIES: QueryComplexity[] = ['simple', 'moderate', 'complex']
const VALID_QUERY_TYPES: LegalQueryType[] = [
  'definition', 'requirement', 'procedure', 'comparison',
  'application', 'consequence', 'scope', 'exemption',
]
const VALID_DOMAINS = [
  'general', 'tax', 'customs', 'labor', 'privacy', 'competition',
  'constitutional', 'admin', 'public_servant', 'housing', 'environment',
  'construction', 'civil_service', 'medical', 'education', 'finance', 'military',
] as const

function validateAndNormalize(raw: unknown, originalQuery: string): RouterPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const complexity = VALID_COMPLEXITIES.includes(r.complexity as QueryComplexity)
    ? (r.complexity as QueryComplexity)
    : 'moderate'

  const queryType = VALID_QUERY_TYPES.includes(r.queryType as LegalQueryType)
    ? (r.queryType as LegalQueryType)
    : 'application'

  const domain = VALID_DOMAINS.includes(r.domain as typeof VALID_DOMAINS[number])
    ? (r.domain as RouterPlan['domain'])
    : 'general'

  const expectedTurnsRaw = Number(r.expectedTurns)
  const expectedTurns = (expectedTurnsRaw === 1 || expectedTurnsRaw === 2 || expectedTurnsRaw === 3)
    ? expectedTurnsRaw
    : 2

  // toolPlan 검증 — 화이트리스트 + 실제 레지스트리 존재 확인.
  // 🔴 args는 라우터가 생성한 값을 전면 무시하고 {query: originalQuery}로 강제 덮어씀.
  //    이유: 라우터가 스키마를 모르고 임의 필드 생성 → tool.schema.parse() 실패 위험.
  //    카탈로그의 모든 도구는 {query}만으로 작동하도록 선별됨.
  const toolPlanRaw = Array.isArray(r.toolPlan) ? r.toolPlan : []
  const toolPlan: RouterToolCall[] = []
  const seenNames = new Set<string>()
  for (const entry of toolPlanRaw) {
    if (toolPlan.length >= ROUTER_MAX_TOOLS_IN_PLAN) break
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const name = typeof e.name === 'string' ? e.name : null
    if (!name) continue
    if (!ALLOWED_TOOL_NAMES.has(name)) continue
    if (!REGISTERED_TOOL_NAMES.has(name)) continue
    if (seenNames.has(name)) continue   // 중복 제거
    seenNames.add(name)
    const rationale = typeof e.rationale === 'string' ? e.rationale : undefined
    toolPlan.push({ name, args: { query: originalQuery }, rationale })
  }

  const reasoning = typeof r.reasoning === 'string' ? r.reasoning : undefined

  return { complexity, queryType, domain, toolPlan, expectedTurns, reasoning }
}

// ─── 20% 해시 롤아웃 헬퍼 ───

/** 질의 해시 기반 결정적 분기. rolloutPct=20 이면 정확히 20% 트래픽이 true. */
export function shouldUseRouter(query: string, rolloutPct: number): boolean {
  if (rolloutPct <= 0) return false
  if (rolloutPct >= 100) return true
  // 간단한 djb2 해시 (crypto 의존성 회피 — 결정적 분기만 필요)
  let hash = 5381
  for (let i = 0; i < query.length; i++) {
    hash = ((hash << 5) + hash + query.charCodeAt(i)) | 0
  }
  const bucket = Math.abs(hash) % 100
  return bucket < rolloutPct
}
