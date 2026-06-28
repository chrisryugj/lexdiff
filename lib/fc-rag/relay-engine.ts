/**
 * Relay 엔진 — 맥미니 lexdiff-relay(/law/query) 호출.
 *
 * 구독(Claude CLI) + korean-law MCP로 법령답변을 생성하는 중계서버를 호출하고,
 * 릴레이 SSE 이벤트를 lexdiff FCRAGStreamEvent로 매핑한다.
 * route.ts에서 Primary로 사용하고, 실패/타임아웃 시 Gemini로 폴백.
 *
 * 릴레이 계약: POST {RELAY_URL}/law/query {query} → SSE
 *   status / narration / answer_delta{text} / tool_call{name,input} / tool_result{name,bytes} / rate_limit / done{answer,cost,turns} / error
 *   answer_delta = 토큰 스트리밍(content_block_delta) → answer_token으로 매핑, done에서 완성 답변으로 교체
 *
 * citation: 릴레이는 평문 답변만 반환 → parseCitationsFromAnswer(「법령명」 제N조)로 텍스트 기반 추출.
 *           (릴레이 시스템프롬프트가 낫표 「」 형식으로 인용하도록 맞춰져 있음)
 */
import type { FCRAGStreamEvent, RAGStreamOptions } from './engine-shared'
import { inferComplexity, inferQueryType } from './engine-shared'
import { parseCitationsFromAnswer } from './citations'
import { TOOL_DISPLAY_NAMES } from './tool-tiers'
import { buildSystemPrompt } from './prompts'

const RELAY_TIMEOUT_MS = 120_000

// lexdiff 프롬프트는 lexdiff tool-registry 도구명(search_ai_law/chain_*/get_batch_articles)을 전제하나,
// 릴레이의 claude는 korean-law MCP의 consolidated surface만 가짐 → 도구명을 MCP로 리맵.
// 답변 형식·구조·현행성·인용 규칙은 lexdiff 프롬프트를 그대로 따르게 한다(프론트 구조화 답변 호환).
const MCP_TOOL_REMAP = `

## 🔧 이 환경의 실제 도구 (위 "도구 사용" 지침의 도구명 대체 — 중요)
사용 가능한 도구는 korean-law MCP뿐이다. 위 지침의 lexdiff 전용 도구명(search_ai_law·get_batch_articles·chain_*·get_three_tier·search_ordinance·search_admin_rule 등)은 무시하고 아래 동등 MCP 도구로 호출하라:
- 법령명→식별자(lawId/mst): \`search_law\`
- 조문 본문: \`get_law_text(mst, jo)\` · 별표/서식: \`get_annexes(lawName, "별표N")\`
- 판례·해석례·헌재·심판례 등 결정문: \`search_decisions(domain=...)\` → \`get_decision_text(domain, id)\`
- 복합·다단계 리서치(법체계/처분근거/쟁송준비/절차/개정추적/조례비교): \`legal_research(task=...)\`
- 인용검증·행위시법·영향분석: \`legal_analysis(mode=...)\`
**답변의 형식·## 헤딩 구조·현행성 표기·인용(「법령명」 제N조 + 시행일자)·별표([별표 N]) 규칙은 위 [답변 지침]을 그대로 준수한다.**`

export async function* executeRelayRAGStream(
  query: string,
  options?: RAGStreamOptions,
): AsyncGenerator<FCRAGStreamEvent> {
  const url = process.env.RELAY_URL
  if (!url) throw new Error('RELAY_URL 미설정')
  const token = process.env.RELAY_TOKEN

  // lexdiff 구조화 답변 프롬프트(형식·구조·현행성)를 빌드해 릴레이에 넘긴다 → Gemini 경로와 동일 구조.
  const systemPrompt =
    buildSystemPrompt(inferComplexity(query), inferQueryType(query), query) + MCP_TOOL_REMAP

  const ac = new AbortController()
  const onAbort = () => ac.abort()
  options?.signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ac.abort(), RELAY_TIMEOUT_MS)

  try {
    let res: Response
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/law/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, systemPrompt }),
        signal: ac.signal,
      })
    } catch (e) {
      throw new Error(`relay 연결 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!res.ok || !res.body) throw new Error(`relay HTTP ${res.status}`)

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let sawAnswer = false
    let successfulTools = 0 // 신뢰도 산정용 — 릴레이는 tool 결과 본문이 없어 도구 호출 수를 grounding 신호로 사용

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
        if (!dataLine) continue
        let ev: { type?: string; [k: string]: unknown }
        try {
          ev = JSON.parse(dataLine.slice(6))
        } catch {
          continue
        }

        switch (ev.type) {
          case 'status':
            yield { type: 'status', message: String(ev.message ?? '처리 중...'), progress: Number(ev.progress ?? 5) }
            break
          case 'answer_delta':
            // 토큰 스트리밍: 릴레이가 content_block_delta로 흘리는 답변 토큰을 실시간 표시.
            // 최종 done에서 완성 답변(+인용)으로 교체된다(useAiSearch가 answer 이벤트에서 setAiAnswerContent로 덮어씀).
            if (ev.text) yield { type: 'answer_token', data: { text: String(ev.text) } }
            break
          case 'tool_call': {
            const name = String(ev.name)
            yield { type: 'tool_call', name, displayName: TOOL_DISPLAY_NAMES[name] || name, query, args: ev.input as Record<string, unknown> | undefined }
            break
          }
          case 'tool_result': {
            const name = String(ev.name)
            successfulTools++
            yield { type: 'tool_result', name, displayName: TOOL_DISPLAY_NAMES[name] || name, success: true, summary: ev.bytes ? `${ev.bytes}B 수신` : '완료' }
            break
          }
          case 'rate_limit':
            yield { type: 'status', message: '법령 엔진 준비 중...', progress: 5 }
            break
          case 'error':
            throw new Error(String(ev.message || 'relay error'))
          case 'done': {
            if (ev.error) throw new Error(`relay: ${String(ev.error)}`)
            const answer = String(ev.answer || '')
            const citations = parseCitationsFromAnswer(answer)
            // 릴레이는 tool 결과 본문이 없어 텍스트·도구 신호로 신뢰도 추정.
            // 인용이 있고 '## 근거 법령' 섹션 + 충분한 도구 조회까지 갖추면 high,
            // 인용·근거섹션 중 하나라도 있으면 medium, 둘 다 없으면 low.
            // (별표 근거 답변이 '인용 0' 으로 떨어져 거짓 '일반 지식' 배너가 뜨던 문제 해소)
            const hasGroundsSection = /##\s*근거\s*법령/.test(answer)
            const confidenceLevel: 'high' | 'medium' | 'low' =
              citations.length >= 1 && hasGroundsSection && successfulTools >= 2 ? 'high'
              : citations.length >= 1 || hasGroundsSection ? 'medium'
              : 'low'
            sawAnswer = true
            yield {
              type: 'answer',
              data: {
                answer,
                citations,
                confidenceLevel,
                complexity: inferComplexity(query),
                queryType: inferQueryType(query),
              },
            }
            break
          }
          // narration 등 기타 이벤트는 무시(중간 진행멘트는 답변에 미포함)
        }
      }
    }

    if (!sawAnswer) throw new Error('relay: 답변 미수신')
  } finally {
    clearTimeout(timer)
    options?.signal?.removeEventListener('abort', onAbort)
  }
}
