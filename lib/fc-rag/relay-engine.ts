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

## ⚡ 도구 호출 예산 (속도 — 절대 규칙, 최우선)
- ★ **도구는 총 5회를 넘기지 마라.** 5회째 호출 후에는 결과가 부족해 보여도 **무조건 가진 결과로 답변을 작성**한다. 도구를 더 부르는 것보다 지금 결과로 답하는 게 항상 낫다.
- **같은 도구를 조문별로 반복 조회 금지**: 특히 \`get_law_text\`를 같은 법령에서 조문을 바꿔가며 여러 번 부르지 마라 — 질문 핵심 조문 **1~2개만** 조회하고 멈춘다(3회 이상 절대 금지).
- **별표가 근거인 질의(수수료·과태료·금액·기준표)**: \`get_annexes\` **1회**로 별표를 받으면 그걸로 끝낸다. 별표에 답이 있으므로 조문을 더 뒤지지 마라. (근거 조문 1개만 \`get_law_text\`로 보충 가능, 그 이상 금지)
- **같은 도구를 2회 이상 호출 금지**: \`legal_research\`·\`search_decisions\`·\`search_law\`는 각각 **1회만**. \`legal_research\` 1회면 법체계·판례·해석례가 한꺼번에 수집되니 그 결과로 즉시 답하라.
- 단순 조문 질의는 \`search_law\` 1회 → \`get_law_text\` 1회로 끝낸다.

## ⛔ 답변 출력 규칙 (내부 메모 노출 금지 — 매우 중요)
- 답변 본문은 **반드시 첫 \`##\` 헤딩(예 \`## 결론\`)으로 시작**한다. 헤딩 앞에 어떤 문장도 두지 마라.
- "핵심 조문을 찾았으니", "충분한 근거를 확보했으니 답변 작성", "도구 조회 결과를 바탕으로 답변함", "이제 ~하겠음" 같은 **내부 추론·진행 멘트를 답변 텍스트에 절대 쓰지 마라**. 도구 사용 여부·근거 충분 판단은 내부적으로만 하고, 사용자에게는 완성된 법령답변(\`##\` 헤딩부터)만 출력한다.

## 📋 답변 정확성 규칙 (반드시 준수 — 단, 위 도구 예산을 넘기면서까지 추가 조회하지는 말 것)
- 본문에서 「법령명」 제N조를 인용했으면 **그 조문을 빠짐없이 '## 근거 법령' 섹션에도 기재**한다(본문에 인용한 조문이 근거 목록에서 누락되면 안 됨).
- 판례·재결·심판례는 **도구로 직접 조회해 사건번호를 확인한 것만** 인용한다. 기억에 의존해 사건번호·재결일자·판결일자를 만들어내지 마라. 정의·요건 같은 단순 질문에는 불필요한 판례 인용을 넣지 마라.
- 시행일은 **도구 결과에 명시된 값만** 표기한다. 도구 결과에 시행일이 없으면 추측하지 말고 생략한다.
- **이미 조회한 도구 결과 텍스트 안에** 핵심 조문·단서·예외항('다만', '…에도 불구하고', 제N항 단서)이 보이면 빠뜨리지 말고 결론에 반영한다(본칙만 보고 '안 됨/불가'로 단정하지 말 것). 단, 이를 확인하겠다고 조문을 **새로 더 조회하지는 마라** — 받은 결과 범위 안에서만 판단한다.
- 비교(comparison) 답변의 표는 **도구 결과로 확인된 항목만** 채운다. 칸을 채우려고 비실재 항목·포괄조항을 지어내지 말고, 어느 쪽이 무엇인지(비교축 방향)를 도구 결과로 확인해 거꾸로 적지 마라.
- 조문의 항·호 번호(제N조 제M항 제K호)·처벌·벌칙은 **이미 조회한 도구 결과 원문에 있는 번호만** 인용하고, 근거 조문과 벌칙 조문을 혼동하지 마라(없으면 추측하지 말고 생략).

## ✍️ 발췌·표 서식 (blockquote 금지)
- 수수료·과태료·금액표·조문 발췌를 \`> \` blockquote(인용부호)로 감싸지 마라. 금액·기준은 **마크다운 표**로, 조문 발췌는 「법령명」 제N조 형식의 **일반 문단**으로 제시한다.

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
            let answer = String(ev.answer || '')
            // 내부 메모 노출 방어: 모델이 가끔 답변 첫 ## 헤딩 앞에 "핵심 조문 확보 완료",
            // "도구 조회 결과에 충분한 근거가 확보됨" 같은 진행 멘트를 붙임(프롬프트로 대부분
            // 차단되나 잔존). 첫 ## 헤딩 앞 짧은 서두(200자 미만)는 잘라낸다.
            const hIdx = answer.search(/^##\s/m)
            if (hIdx > 0 && hIdx < 200) answer = answer.slice(hIdx).trimStart()
            const citations = parseCitationsFromAnswer(answer)
            // 릴레이는 tool 결과 본문이 없어 텍스트·도구 신호로 신뢰도 추정.
            // 신뢰도는 근거(citation·근거섹션) 기준 — 도구 호출 수에 의존하지 않는다.
            // (도구예산으로 도구를 줄여도 인용·근거섹션이 충분하면 high. 이전 successfulTools>=2
            //  조건은 도구예산과 충돌해, citation 3~4개로 근거 충분한 답을 medium으로 깎는 회귀를 유발했음.)
            const hasGroundsSection = /##\s*근거\s*법령/.test(answer)
            const confidenceLevel: 'high' | 'medium' | 'low' =
              citations.length >= 2 && hasGroundsSection ? 'high'
              : citations.length >= 1 && (hasGroundsSection || successfulTools >= 2) ? 'high'
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
