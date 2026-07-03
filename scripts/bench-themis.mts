/**
 * Themis(맥미니 릴레이) vs Gemini 벤치마크 — /api/fc-rag 라우트 경유(프로덕션 동일 경로)
 *
 * 측정: t_first_tool / t_first_token / t_answer / total, tool 수, 인용 수,
 *       인용 검증률(citation_verification), 기대인용 적중, source(실사용 엔진)
 *
 * 엔진 선택:
 *   relay  → x-bench-secret 헤더 = authed 경로 → RELAY_URL 사용
 *            ⚠️ api-auth.ts에 로컬 전용 우회 패치 필요(커밋 금지):
 *            requireAiAuth 최상단에 `if (process.env.FC_RAG_BENCH_SECRET && request.headers.get('x-bench-secret') === process.env.FC_RAG_BENCH_SECRET) return { ctx: { userId: 'bench-local', byokKey: null, isByok: false, quota: null, feature } }`
 *   gemini → x-user-api-key(BYOK) = Gemini 직행
 *
 * 사용: npx tsx scripts/bench-themis.mts [--engine relay|gemini|both] [--out results.json] [--base http://localhost:3000]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2]
}

const BASE = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:3000'

interface Scenario { id: string; query: string; expect: string[] }

const SCENARIOS: Scenario[] = [
  { id: 'simple_article', query: '관세법 38조', expect: ['관세법', '제38조'] },
  { id: 'labor_penalty', query: '해고예고수당 미지급 시 벌칙', expect: ['근로기준법', '제26조'] },
  { id: 'annex_fee', query: '여권 발급 수수료는 얼마인가요?', expect: ['여권법', '수수료'] },
  { id: 'precedent', query: '전동킥보드 음주운전 처벌 판례', expect: ['도로교통법'] },
  { id: 'compare', query: '국고보조금과 지방보조금 반환 규정 차이', expect: ['보조금 관리에 관한 법률'] },
  { id: 'complex', query: '공무원이 겸직허가 없이 유튜브 수익을 얻으면 어떤 징계를 받나요?', expect: ['국가공무원법', '제64조'] },
]

interface BenchResult {
  engine: string; id: string; query: string; source: string | null
  tFirstTool: number | null; tFirstToken: number | null; tAnswer: number | null; total: number
  tools: string[]; answerLen: number; citations: number; verifyRate: string | null
  expectHits: string[]; expectMiss: string[]; error: string | null
}

async function runOne(engine: 'relay' | 'gemini', s: Scenario): Promise<BenchResult> {
  const t0 = Date.now()
  const r: BenchResult = {
    engine, id: s.id, query: s.query, source: null,
    tFirstTool: null, tFirstToken: null, tAnswer: null, total: 0,
    tools: [], answerLen: 0, citations: 0, verifyRate: null,
    expectHits: [], expectMiss: [], error: null,
  }
  let answer = ''
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (engine === 'relay') headers['x-bench-secret'] = env.FC_RAG_BENCH_SECRET
    else headers['x-user-api-key'] = env.GEMINI_API_KEY

    const res = await fetch(`${BASE}/api/fc-rag`, {
      method: 'POST', headers, body: JSON.stringify({ query: s.query }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok || !res.body) { r.error = `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`; r.total = Date.now() - t0; return r }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx); buf = buf.slice(idx + 2)
        const dataLine = block.split('\n').find(l => l.startsWith('data: '))
        if (!dataLine) continue
        let ev: Record<string, unknown>
        try { ev = JSON.parse(dataLine.slice(6)) } catch { continue }
        const dt = Date.now() - t0
        switch (ev.type) {
          case 'tool_call': r.tools.push(String(ev.name ?? '?')); if (r.tFirstTool === null) r.tFirstTool = dt; break
          case 'answer_token': if (r.tFirstToken === null) r.tFirstToken = dt; break
          case 'answer': {
            r.tAnswer = dt
            const d = ev.data as { answer?: string; citations?: unknown[] } | undefined
            answer = d?.answer || ''
            r.citations = d?.citations?.length || 0
            break
          }
          case 'citation_verification': {
            const cs = (ev.citations as { verified?: boolean }[] | undefined) || []
            r.verifyRate = `${cs.filter(c => c.verified).length}/${cs.length}`
            break
          }
          case 'source': r.source = String(ev.source ?? ''); break
          case 'error': r.error = String(ev.message ?? 'unknown'); break
          case 'stream_reset': r.tFirstToken = null; break // 폴백 시 이전 토큰 타이밍 무효
        }
      }
    }
  } catch (e) { r.error = e instanceof Error ? e.message : String(e) }
  r.total = Date.now() - t0
  r.answerLen = answer.length
  for (const exp of s.expect) (answer.includes(exp) ? r.expectHits : r.expectMiss).push(exp)
  return r
}

const engineArg = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'both'
const outArg = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null
const engines = (engineArg === 'both' ? ['relay', 'gemini'] : [engineArg]) as ('relay' | 'gemini')[]

const results: BenchResult[] = []
for (const engine of engines) {
  console.log(`\n═══ ${engine.toUpperCase()} ═══`)
  for (const s of SCENARIOS) {
    const r = await runOne(engine, s)
    results.push(r)
    const fmt = (v: number | null) => v === null ? '—' : (v / 1000).toFixed(1) + 's'
    console.log(
      `[${s.id}] src=${r.source} total=${fmt(r.total)} firstTool=${fmt(r.tFirstTool)} firstToken=${fmt(r.tFirstToken)}` +
      ` tools=${r.tools.length} cite=${r.citations} verify=${r.verifyRate ?? '—'} len=${r.answerLen}` +
      ` expect=${r.expectHits.length}/${s.expect.length}${r.expectMiss.length ? ' MISS:' + r.expectMiss.join(',') : ''}` +
      (r.error ? ` ERR=${r.error.slice(0, 100)}` : ''),
    )
  }
}

for (const engine of engines) {
  const rs = results.filter(x => x.engine === engine && !x.error)
  const avg = (f: (x: BenchResult) => number | null) => {
    const vs = rs.map(f).filter((v): v is number => v !== null)
    return vs.length ? (vs.reduce((a, b) => a + b, 0) / vs.length / 1000).toFixed(1) + 's' : '—'
  }
  const hit = rs.reduce((a, x) => a + x.expectHits.length, 0)
  const tot = rs.reduce((a, x) => a + x.expectHits.length + x.expectMiss.length, 0)
  console.log(`\n── ${engine}: avgTotal=${avg(x => x.total)} avgFirstToken=${avg(x => x.tFirstToken)} expect=${hit}/${tot} err=${results.filter(x => x.engine === engine && x.error).length}`)
}

if (outArg) writeFileSync(outArg, JSON.stringify(results, null, 2))
