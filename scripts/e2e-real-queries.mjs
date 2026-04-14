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

import { mkdirSync, createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

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

const realQueries = [
  {
    n: 1, persona: '일반 직장인',
    query: '해고예고수당 못 받으면 어떻게 해야 하나요?',
    expectedTools: ['search_ai_law'],
    expectedCitations: ['근로기준법', '제26조', '제110조'],
  },
  {
    n: 2, persona: '건축가',
    query: '대지면적 산정 시 도로에 접한 부분은 어떻게 처리하나요?',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: ['건축법', '제3조'],
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
    expectedCitations: ['국가공무원법', '제71조'],
  },
  {
    n: 5, persona: '자영업자',
    query: '종합소득세 기장의무와 단순경비율 적용 기준',
    expectedTools: ['search_ai_law'],
    expectedCitations: ['소득세법', '제160조'],
  },
  {
    n: 6, persona: '법조인',
    query: '민법 제839조의2 재산분할청구권의 제척기간 기산점 판례',
    expectedTools: ['search_decisions', 'get_decision_text'],
    expectedCitations: ['민법', '제839조의2'],
  },
  {
    n: 7, persona: '중소기업 대표',
    query: '52시간 근로시간제 위반 시 처벌과 유예조항',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: ['근로기준법', '제53조', '제110조'],
  },
  {
    n: 8, persona: '임대인',
    query: '임차인이 월세 3개월 연체 시 계약 해지 방법과 절차',
    expectedTools: ['search_ai_law', 'search_decisions'],
    // 법률적 근거: 주택 월세 연체 해지는 민법 제640조 (차임연체와 해지). 주임법은 갱신/대항력용.
    expectedCitations: ['민법', '제640조'],
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
    expectedCitations: ['개인정보보호법', '제34조'],
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

function timestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function precisionRecall(expected, found) {
  if (!expected.length) return { precision: null, recall: null, matched: [] }
  const matched = expected.filter(c => found.includes(c))
  const recall = matched.length / expected.length
  const precision = found.length ? matched.length / found.length : 0
  return { precision: +precision.toFixed(2), recall: +recall.toFixed(2), matched }
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

  const start = Date.now()
  try {
    const res = await fetch(FC_RAG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...BYOK_HEADER },
      body: JSON.stringify({ query: q.query }),
      signal: AbortSignal.timeout(180_000),
    })
    record.httpStatus = res.status
    if (!res.ok) {
      record.errors.push(`HTTP ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 500))
      record.durationMs = Date.now() - start
      return record
    }

    const events = parseSSE(await res.text())

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
          record.isTruncated = !!data.isTruncated
          record.source = data.source || record.source
          const found = record.citationsExpected.filter(c => text.includes(c))
          record.citationsFound = found
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
  record.citationMatch = precisionRecall(record.citationsExpected, record.citationsFound)
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

  for (const q of queries) {
    process.stdout.write(`[${q.n}] ${q.persona.padEnd(16)} ... `)
    const rec = await runQuery(q)
    results.push(rec)
    out.write(JSON.stringify(rec) + '\n')

    const cr = rec.citationMatch
    const citStr = cr && cr.recall != null ? `R${cr.recall}/P${cr.precision}` : '-'
    const conf = rec.confidenceLevel || '?'
    const routerStr = rec.routerHit ? 'R' : '-'
    const cacheStr = rec.cacheHitRate != null ? `${Math.round(rec.cacheHitRate * 100)}%` : '-'
    const err = rec.errors[0] ? ` ⚠️${rec.errors[0].slice(0, 40)}` : ''
    console.log(
      `${fmt(rec.durationMs)} tools:${rec.toolCount} cite:${citStr} conf:${conf} cache:${cacheStr} ${routerStr}${err}`
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
