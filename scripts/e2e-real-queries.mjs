#!/usr/bin/env node
/**
 * FC-RAG 실전 쿼리 10종 품질 분석 (세션 3)
 *
 * 목적:
 * - 10개 페르소나별 쿼리를 sequential 실행
 * - 쿼리당 한 줄 JSONL 로 품질/지연/토큰/cache hit 덤프
 * - 콘솔 요약표로 저품질 패턴(citation 누락, confidence 저조, tool 오선택, latency 편차) 파악
 *
 * 사용:
 *   export GEMINI_API_KEY=...
 *   node scripts/e2e-real-queries.mjs [--only=1,3,5] [--base=http://localhost:3000]
 *
 * 출력:
 *   logs/e2e-real-queries-{YYYYMMDD-HHmmss}.jsonl
 */

import { mkdirSync, createWriteStream, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Agent, setGlobalDispatcher } from 'undici'

// 🔴 Node undici 의 기본 keep-alive Agent 가 Next dev 서버의 장시간 SSE stream
//    (20-40s) 을 끝까지 drain 하지 못하고 "SocketError: other side closed" 로
//    fetch failed 를 터뜨리는 경합이 있어, pipelining=0 + keepAlive OFF 로
//    매 요청마다 새 소켓을 쓰도록 강제. E2E 안정화 핵심.
setGlobalDispatcher(new Agent({
  pipelining: 0,
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1,
  connect: { timeout: 30_000 },
  bodyTimeout: 200_000,
  headersTimeout: 30_000,
}))

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ─── .env.local 자동 로드 (GEMINI_API_KEY BYOK) ───
{
  const envPath = resolve(PROJECT_ROOT, '.env.local')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      const [, k, v] = m
      if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '')
    }
  }
}

// ─── CLI args ───

const argBase = process.argv.find(a => a.startsWith('--base='))
const argOnly = process.argv.find(a => a.startsWith('--only='))
const BASE = argBase ? argBase.slice('--base='.length) : 'http://localhost:3000'
const ONLY = argOnly
  ? new Set(argOnly.slice('--only='.length).split(',').map(s => parseInt(s.trim(), 10)))
  : null

const FC_RAG_URL = `${BASE}/api/fc-rag`
const BYOK_HEADER = process.env.GEMINI_API_KEY
  ? { 'x-user-api-key': process.env.GEMINI_API_KEY }
  : {}

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY 미설정 — BYOK 헤더 없이 요청. Supabase auth 통과 여부에 따라 401 가능.')
}

// ─── 10개 페르소나 × 쿼리 (핸드오프 문서 세션 3 참조) ───

// expectedCitations 형식:
//  - Array<string>        → 모든 항목이 required (legacy 호환)
//  - { required, anyOf }  → required 는 전부 필요, anyOf 는 1개만 매칭되면 통과
//
// LLM 이 run 마다 "법률 본문 조문 vs 시행령 조문" 을 다르게 선택하는 경향이 있어
// 같은 법령 주제의 여러 근거 조문을 anyOf 로 묶어 noise 에 견고하게 한다.
// (검증 기준: 답변에 둘 중 어느 하나라도 등장하면 그 주제에 대한 근거 제시로 인정.)

const realQueries = [
  {
    n: 1, persona: '일반 직장인',
    query: '해고예고수당 못 받으면 어떻게 해야 하나요?',
    expectedTools: ['search_ai_law'],
    expectedCitations: {
      required: ['근로기준법'],
      // 제26조(해고예고) 는 의무 조문, 제110조 는 벌칙. 답변이 의무·벌칙 중 하나만 언급해도 OK.
      anyOf: ['제26조', '제110조'],
    },
  },
  {
    n: 2, persona: '건축가',
    query: '대지면적 산정 시 도로에 접한 부분은 어떻게 처리하나요?',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: {
      required: ['건축법'],
      // 제46조(건축선) 또는 시행령 제119조(면적 산정방법) 둘 중 하나.
      anyOf: ['제46조', '제119조'],
    },
  },
  {
    n: 3, persona: '세무사',
    query: '상속세 신고 기한 놓쳤을 때 가산세와 불복 절차',
    expectedTools: ['search_ai_law', 'search_decisions'],
    expectedCitations: ['상속세', '가산세'],
  },
  {
    n: 4, persona: '공무원(인사)',
    query: '육아휴직 중 승진심사 제외가 적법한지',
    expectedTools: ['search_ai_law', 'search_decisions'],
    // 육아휴직 불리한 처우 쟁점은 여러 법령에서 동시에 다뤄짐:
    //  - 국가공무원법 제71조(휴직) — 공무원 육아휴직 근거
    //  - 남녀고용평등법 제19조(육아휴직) — 일반 근로자 + 불리한 처우 금지
    //  - 공무원임용령 제31조(승진소요최저연수) — 승진 운영
    // LLM 답변이 이 중 어느 관점을 택해도 정답으로 인정.
    expectedCitations: {
      required: [],
      anyOf: ['국가공무원법', '남녀고용평등', '공무원임용령'],
    },
  },
  {
    n: 5, persona: '자영업자',
    query: '종합소득세 기장의무와 단순경비율 적용 기준',
    expectedTools: ['search_ai_law'],
    expectedCitations: {
      required: ['소득세법'],
      // 법률 조문: 제70조(확정신고)/제160조(장부 비치·기록). 시행령 제143조(추계결정)/
      // 제145조(기준·단순경비율)/제208조(장부). LLM 이 run 마다 법률 조문과 시행령
      // 조합을 다르게 선택하므로 넷 중 하나만 매칭되면 정답으로 인정.
      anyOf: ['제70조', '제160조', '제143조', '제145조'],
    },
  },
  {
    n: 6, persona: '법조인',
    query: '민법 제839조의2 재산분할청구권의 제척기간 기산점 판례',
    expectedTools: ['search_decisions', 'get_decision_text'],
    expectedCitations: {
      required: ['민법', '제839조의2'],
    },
  },
  {
    n: 7, persona: '중소기업 대표',
    query: '52시간 근로시간제 위반 시 처벌과 유예조항',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: {
      required: ['근로기준법'],
      // 제53조(연장근로 한도) 또는 제110조(벌칙). 처벌 vs 유예 중 한 주제라도 조문 매칭.
      anyOf: ['제53조', '제110조'],
    },
  },
  {
    n: 8, persona: '임대인',
    query: '임차인이 월세 3개월 연체 시 계약 해지 방법과 절차',
    expectedTools: ['search_ai_law', 'search_decisions'],
    // 법률적 근거: 주택 월세 연체 해지는 민법 제640조 (차임연체와 해지). 주임법은 갱신/대항력용.
    expectedCitations: {
      required: ['민법'],
      anyOf: ['제640조'],
    },
  },
  {
    n: 9, persona: '지자체 담당',
    query: '서울시 조례로 주차장 설치 완화 가능 범위',
    expectedTools: ['search_ordinance', 'chain_ordinance_compare'],
    expectedCitations: ['주차장법'],
  },
  {
    n: 10, persona: '개인사업자(개인정보)',
    query: '고객 개인정보 유출 시 신고 의무와 과태료',
    expectedTools: ['search_ai_law', 'search_decisions'],
    expectedCitations: {
      required: ['개인정보보호법'],
      // 제34조(유출 통지·신고), 제34조의2(과징금), 제75조(과태료).
      anyOf: ['제34조', '제34조의2', '제75조'],
    },
  },
]

// ─── 유틸 ───

function parseSSE(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try { events.push(JSON.parse(line.slice(6))) } catch {}
    }
  }
  return events
}

function fmt(ms) { return (ms / 1000).toFixed(1) + 's' }

// 법령명 매칭용 정규화: 공백/점/중점 제거 + 소문자.
// "개인정보보호법" vs "개인정보 보호법", "소득세법 시행령" vs "소득세법시행령" 등
// 한 글자 차이로 false negative 나던 케이스 대응.
function normalizeForMatch(s) {
  return String(s).replace(/[\s·．\.]+/g, '').toLowerCase()
}

function timestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// expected → { required, anyOf } 정규화 (Array 하위호환)
function normalizeExpected(expected) {
  if (Array.isArray(expected)) return { required: expected, anyOf: [] }
  return { required: expected?.required || [], anyOf: expected?.anyOf || [] }
}

// expected 구조 기반 precision/recall.
//  - required 는 AND (전부 매칭 필수)
//  - anyOf 는 OR (하나라도 매칭되면 1 기여)
//  - total 분모 = required.length + (anyOf 있으면 1)
function scoreCitations(answerText, expectedSpec) {
  const { required, anyOf } = normalizeExpected(expectedSpec)
  if (required.length === 0 && anyOf.length === 0) {
    return { precision: null, recall: null, matched: [], total: 0 }
  }
  const textNorm = normalizeForMatch(answerText)
  const matchedRequired = required.filter(c => textNorm.includes(normalizeForMatch(c)))
  const matchedAny = anyOf.filter(c => textNorm.includes(normalizeForMatch(c)))
  const total = required.length + (anyOf.length > 0 ? 1 : 0)
  const hit = matchedRequired.length + (matchedAny.length > 0 ? 1 : 0)
  const matched = [...matchedRequired, ...matchedAny]
  const recall = total > 0 ? hit / total : 0
  // precision: 매칭된 모든 keyword / 전체 후보 keyword
  const allCandidates = required.length + anyOf.length
  const precision = allCandidates > 0 ? matched.length / allCandidates : 0
  return {
    precision: +precision.toFixed(2),
    recall: +recall.toFixed(2),
    matched,
    total,
    requiredHit: matchedRequired.length,
    requiredTotal: required.length,
    anyOfHit: matchedAny.length,
  }
}

// ─── 쿼리 1건 실행 ───

async function runQuery(q) {
  const record = {
    n: q.n,
    persona: q.persona,
    query: q.query,
    startedAt: new Date().toISOString(),
    durationMs: 0,

    tools: [],
    toolCount: 0,
    routerHit: false,
    routerPlan: null,

    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    cacheHitRate: null,

    answerLength: 0,
    answerSnippet: '',
    answerCitationsRaw: [],
    confidenceLevel: null,
    isTruncated: false,

    citationsExpected: q.expectedCitations,
    citationsFound: [],
    citationMatch: null,

    source: null,
    warnings: [],
    errors: [],
    statusMessages: [],

    mstHallucination: false,
    httpStatus: null,
  }

  // 연속 fetch 요청 간 Node undici 가 keep-alive socket 을 재사용하면서
  // 서버가 SSE stream 을 flush 하기 전 소켓이 끊기는 경합이 종종 발생.
  // → Connection: close + retry 1회 + 요청 간 짧은 sleep 으로 완화.
  const doFetch = async () => {
    const r = await fetch(FC_RAG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close', ...BYOK_HEADER },
      body: JSON.stringify({ query: q.query }),
      signal: AbortSignal.timeout(180_000),
    })
    const text = await r.text()
    return { status: r.status, ok: r.ok, text }
  }

  const start = Date.now()
  try {
    let resp
    try {
      resp = await doFetch()
    } catch (err) {
      record.warnings.push(`fetch retry after: ${err?.message || err}`.slice(0, 160))
      await new Promise(r => setTimeout(r, 500))
      resp = await doFetch()
    }
    record.httpStatus = resp.status
    if (!resp.ok) {
      record.errors.push(`HTTP ${resp.status}: ${resp.text}`.slice(0, 500))
      record.durationMs = Date.now() - start
      return record
    }

    const events = parseSSE(resp.text)

    for (const evt of events) {
      switch (evt.type) {
        case 'tool_call':
          record.tools.push(evt.name)
          break
        case 'status':
          if (typeof evt.message === 'string') {
            record.statusMessages.push(evt.message)
            if (evt.message.includes('S1 라우터') || evt.message.includes('S1 플랜')) {
              record.routerHit = true
            }
          }
          break
        case 'router_plan':
          record.routerHit = true
          record.routerPlan = evt.plan || evt.data || null
          break
        case 'answer': {
          const data = evt.data || evt
          const text = data.answer || data.text || ''
          record.answerLength = text.length
          record.answerSnippet = text.slice(0, 4000)
          record.answerCitationsRaw = Array.isArray(data.citations) ? data.citations.slice(0, 20) : []
          record.confidenceLevel = data.confidenceLevel || null
          record.confidenceBreakdown = data.confidenceBreakdown || null
          record.isTruncated = !!data.isTruncated
          record.fromCache = !!data.fromCache
          record.source = data.source || record.source
          // scoreCitations 가 normalize + required/anyOf 처리 전담.
          record.citationMatch = scoreCitations(text, record.citationsExpected)
          record.citationsFound = record.citationMatch.matched
          break
        }
        case 'source':
          record.source = evt.source || record.source
          break
        case 'token_usage':
          record.inputTokens = evt.inputTokens ?? evt.input ?? null
          record.outputTokens = evt.outputTokens ?? evt.output ?? null
          record.cachedTokens = evt.cachedTokens ?? null
          if (record.inputTokens && record.cachedTokens != null && record.inputTokens > 0) {
            record.cacheHitRate = +(record.cachedTokens / record.inputTokens).toFixed(3)
          }
          break
        case 'warning':
          if (evt.message) record.warnings.push(evt.message)
          break
        case 'error':
          if (evt.message) {
            record.errors.push(evt.message)
            if (/법령 데이터를 찾을 수 없습니다/.test(evt.message)) {
              record.mstHallucination = true
            }
          }
          break
      }
    }
  } catch (err) {
    record.errors.push(err?.message || String(err))
  }

  record.durationMs = Date.now() - start
  record.toolCount = record.tools.length
  // answer 이벤트가 아예 없었던 경우 citationMatch 가 null 일 수 있음 → 빈 점수로 보정
  if (!record.citationMatch) {
    record.citationMatch = scoreCitations('', record.citationsExpected)
  }
  return record
}

// ─── 메인 ───

async function main() {
  const queries = ONLY ? realQueries.filter(q => ONLY.has(q.n)) : realQueries
  const logDir = join(PROJECT_ROOT, 'logs')
  mkdirSync(logDir, { recursive: true })
  const ts = timestamp()
  const logPath = join(logDir, `e2e-real-queries-${ts}.jsonl`)
  const out = createWriteStream(logPath, { flags: 'w' })

  console.log(`=== FC-RAG Real Queries E2E (${queries.length} scenarios, sequential) ===`)
  console.log(`Base: ${BASE}`)
  console.log(`Log:  ${logPath}\n`)

  const results = []
  const totalStart = Date.now()

  // 서버가 "AI 엔진 일시 문제" / "답변 생성 실패" 답변을 반환한 경우 감지
  const isFailAnswer = (r) => {
    const a = r.answerSnippet || ''
    if (a.length > 0 && a.length < 120 && /(일시적\s*문제|생성하지\s*못|답변\s*생성에\s*실패)/.test(a)) return true
    if (r.errors.length > 0 && r.answerLength < 60) return true
    return false
  }

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]
    // 첫 요청 제외, 요청 간 짧은 간격으로 keep-alive 소켓 회수 여유 확보.
    if (i > 0) await new Promise(r => setTimeout(r, 400))
    process.stdout.write(`[${q.n}] ${q.persona.padEnd(16)} ... `)
    let rec = await runQuery(q)
    // Gemini API 일시 장애로 서버가 200 + fail 답변 반환한 경우 1회 재시도
    if (isFailAnswer(rec)) {
      process.stdout.write('(retry fail-answer) ')
      await new Promise(r => setTimeout(r, 1500))
      rec = await runQuery(q)
    }
    results.push(rec)
    out.write(JSON.stringify(rec) + '\n')

    const cr = rec.citationMatch
    const citStr = cr && cr.recall != null ? `R${cr.recall}/P${cr.precision}` : '-'
    const conf = rec.confidenceLevel || '?'
    const routerStr = rec.routerHit ? 'R' : '-'
    const cacheStr = rec.cacheHitRate != null ? `${Math.round(rec.cacheHitRate * 100)}%` : '-'
    const err = rec.errors[0] ? ` ⚠️${rec.errors[0].slice(0, 40)}` : ''
    const cacheTag = rec.fromCache ? ' [CACHED]' : ''
    console.log(
      `${fmt(rec.durationMs)} tools:${rec.toolCount} cite:${citStr} conf:${conf} cache:${cacheStr} ${routerStr}${cacheTag}${err}`
    )
  }

  out.end()
  const totalMs = Date.now() - totalStart

  // ─── 요약표 ───
  console.log('\n========== SUMMARY ==========\n')
  console.log('# | Persona          | Time  | Tools | Cite(R/P) | Conf    | Cache | Router | MST | Err')
  console.log('--|------------------|-------|-------|-----------|---------|-------|--------|-----|----')
  for (const r of results) {
    const cr = r.citationMatch
    const citStr = cr && cr.recall != null ? `${cr.recall}/${cr.precision}` : '-/-'
    const conf = (r.confidenceLevel || '?').padEnd(7)
    const cache = r.cacheHitRate != null ? `${Math.round(r.cacheHitRate * 100)}%`.padEnd(5) : '-    '
    const router = r.routerHit ? '✓' : '-'
    const mst = r.mstHallucination ? '!' : '-'
    const errCount = r.errors.length
    console.log(
      `${String(r.n).padStart(2)} | ${r.persona.padEnd(16)} | ${fmt(r.durationMs).padStart(5)} | ${String(r.toolCount).padStart(5)} | ${citStr.padEnd(9)} | ${conf} | ${cache} | ${router.padEnd(6)} | ${mst.padEnd(3)} | ${errCount}`
    )
  }

  // ─── 집계 ───
  const n = results.length
  const avg = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : 0
  const durations = results.map(r => r.durationMs)
  const cacheRates = results.map(r => r.cacheHitRate).filter(x => x != null)
  const recalls = results.map(r => r.citationMatch?.recall).filter(x => x != null)
  const highConf = results.filter(r => r.confidenceLevel === 'high').length
  const noAnswer = results.filter(r => r.answerLength === 0).length
  const mstHalluc = results.filter(r => r.mstHallucination).length
  const routerHits = results.filter(r => r.routerHit).length
  const inputTokenSum = results.reduce((s, r) => s + (r.inputTokens || 0), 0)
  const outputTokenSum = results.reduce((s, r) => s + (r.outputTokens || 0), 0)
  const cachedTokenSum = results.reduce((s, r) => s + (r.cachedTokens || 0), 0)

  console.log('\n── Aggregates ──')
  console.log(`  Total wall time:      ${fmt(totalMs)}`)
  console.log(`  Avg duration:         ${fmt(avg(durations))}`)
  console.log(`  Min / Max:            ${fmt(Math.min(...durations))} / ${fmt(Math.max(...durations))}`)
  console.log(`  Citation recall avg:  ${recalls.length ? (avg(recalls) * 100).toFixed(0) + '%' : '-'}`)
  console.log(`  High confidence:      ${highConf}/${n}`)
  console.log(`  No answer:            ${noAnswer}/${n}`)
  console.log(`  Router hits:          ${routerHits}/${n}`)
  console.log(`  MST hallucination:    ${mstHalluc}/${n}`)
  console.log(`  Tokens (in/out/cached): ${inputTokenSum} / ${outputTokenSum} / ${cachedTokenSum}`)
  const overallCacheRate = inputTokenSum > 0 ? ((cachedTokenSum / inputTokenSum) * 100).toFixed(1) + '%' : '-'
  console.log(`  Overall cache hit:    ${overallCacheRate}${cacheRates.length === 0 ? '  (no cachedTokens field observed)' : ''}`)

  console.log(`\n✅ JSONL saved: ${logPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
