#!/usr/bin/env node
/**
 * FC-RAG E2E Quality Test — Phase 3.1
 *
 * 개선사항:
 * - FC-RAG 5개 시나리오 병렬 실행 (--parallel 플래그)
 * - Impact Tracker + Benchmark Analyze 기능 검증 추가
 * - 결과 비교 (이전 실행 vs 현재)
 */

const BASE = 'http://localhost:3000'
const FC_RAG_URL = `${BASE}/api/fc-rag`
const IMPACT_URL = `${BASE}/api/impact-tracker`
const BENCHMARK_URL = `${BASE}/api/benchmark-analyze`
const BYOK_HEADER = process.env.GEMINI_API_KEY
  ? { 'x-user-api-key': process.env.GEMINI_API_KEY }
  : {}

const isParallel = process.argv.includes('--parallel')
const skipExtended = process.argv.includes('--fast')

// ─── FC-RAG 시나리오 ───

const fcragScenarios = [
  {
    id: 'customs', query: '수입물품 과세가격 결정방법',
    expectedTools: ['search_ai_law', 'chain_action_basis', 'search_decisions'],
    expectedCitations: ['관세법', '제30조'],
  },
  {
    id: 'labor', query: '해고예고수당 미지급 시 벌칙',
    expectedTools: ['search_ai_law', 'search_decisions', 'get_batch_articles'],
    expectedCitations: ['근로기준법', '제26조', '제110조'],
  },
  {
    id: 'tax', query: '양도소득세 1세대 1주택 비과세 요건',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: ['소득세법', '제89조'],
  },
  {
    id: 'public_servant', query: '공무원 휴직 종류와 기간',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: ['국가공무원법', '제71조'],
  },
  {
    id: 'construction', query: '서울시 주차장 설치 기준',
    expectedTools: ['search_ai_law', 'search_ordinance', 'chain_ordinance_compare'],
    expectedCitations: ['주차장법'],
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

// ─── FC-RAG 시나리오 실행 ───

async function runFCRAG(scenario) {
  const result = {
    id: scenario.id, query: scenario.query,
    tools: [], answer: null, citations: [], citationVerification: null,
    source: null, errors: [], tokenUsage: null,
    quality: { toolMatch: false, toolHits: [], citationMatch: false, citationHits: [], answerQuality: 'no_answer', verificationRate: null },
    durationMs: 0,
  }
  const start = Date.now()
  try {
    const res = await fetch(FC_RAG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...BYOK_HEADER },
      body: JSON.stringify({ query: scenario.query }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) { result.errors.push(`HTTP ${res.status}`); return result }
    const events = parseSSE(await res.text())
    for (const evt of events) {
      if (evt.type === 'tool_call') result.tools.push(evt.name)
      if (evt.type === 'answer') { result.answer = evt.data; result.citations = evt.data?.citations || [] }
      if (evt.type === 'citation_verification') result.citationVerification = evt.citations
      if (evt.type === 'source') result.source = evt.source
      if (evt.type === 'token_usage') result.tokenUsage = evt
      if (evt.type === 'error') result.errors.push(evt.message)
    }
  } catch (err) { result.errors.push(err.message) }
  result.durationMs = Date.now() - start

  // 평가
  const calledSet = new Set(result.tools)
  const answerText = result.answer?.answer || ''
  result.quality = {
    toolMatch: scenario.expectedTools.some(t => calledSet.has(t)),
    toolHits: scenario.expectedTools.filter(t => calledSet.has(t)),
    citationMatch: scenario.expectedCitations.every(c => answerText.includes(c)),
    citationHits: scenario.expectedCitations.filter(c => answerText.includes(c)),
    answerQuality: !result.answer ? 'no_answer'
      : answerText.length < 50 ? 'too_short'
      : result.answer.confidenceLevel === 'high' ? 'high' : result.answer.confidenceLevel || 'unknown',
    verificationRate: result.citationVerification
      ? `${result.citationVerification.filter(c => c.verified).length}/${result.citationVerification.length}`
      : null,
  }
  return result
}

// ─── Impact Tracker 테스트 ───

async function testImpactTracker() {
  const result = { id: 'impact-tracker', status: 'unknown', events: [], errors: [], durationMs: 0 }
  const start = Date.now()
  try {
    const res = await fetch(IMPACT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lawNames: ['근로기준법'],
        dateFrom: '2025-01-01',
        dateTo: '2026-03-21',
        mode: 'impact',
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) { result.errors.push(`HTTP ${res.status}: ${await res.text()}`); result.status = 'http_error'; return result }
    const events = parseSSE(await res.text())
    result.events = events.map(e => e.type)

    const hasStatus = events.some(e => e.type === 'status')
    const hasComplete = events.some(e => e.type === 'complete')
    const hasSummary = events.some(e => e.type === 'summary')
    const hasError = events.some(e => e.type === 'error')
    const itemCount = events.filter(e => e.type === 'impact_item').length
    const changesFound = events.filter(e => e.type === 'changes_found').length

    result.itemCount = itemCount
    result.changesFound = changesFound
    result.hasSummary = hasSummary

    if (hasError && !hasComplete) {
      result.status = 'error'
      result.errors.push(events.find(e => e.type === 'error')?.message || 'unknown')
    } else if (hasComplete || hasSummary) {
      result.status = 'pass'
    } else if (hasStatus) {
      result.status = 'partial'
    } else {
      result.status = 'no_events'
    }
  } catch (err) { result.errors.push(err.message); result.status = 'exception' }
  result.durationMs = Date.now() - start
  return result
}

// ─── Benchmark Analyze 테스트 ───

async function testBenchmarkAnalyze() {
  const result = { id: 'benchmark-analyze', status: 'unknown', errors: [], durationMs: 0 }
  const start = Date.now()
  try {
    // 먼저 조례 검색으로 ordinanceSeq 확보
    const searchRes = await fetch(`${BASE}/api/fc-rag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '주민자치회 설치 및 운영에 관한 조례' }),
      signal: AbortSignal.timeout(60_000),
    })

    // 직접 법제처 API로 조례 검색하여 2개 이상 확보
    const OC = process.env.LAW_OC || 'ryuseungin'
    const ordinSearchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=ordin&type=XML&query=${encodeURIComponent('주민자치회 설치 및 운영에 관한 조례')}&display=5`
    const ordinRes = await fetch(ordinSearchUrl, { signal: AbortSignal.timeout(10_000) })

    if (!ordinRes.ok) {
      result.status = 'ordin_search_fail'
      result.errors.push(`Ordinance search HTTP ${ordinRes.status}`)
      result.durationMs = Date.now() - start
      return result
    }

    const xmlText = await ordinRes.text()
    // 간단 XML 파싱 (자치법규일련번호 + 자치법규명한글 + 공포기관명)
    const seqMatches = [...xmlText.matchAll(/<자치법규일련번호>(\d+)<\/자치법규일련번호>/g)]
    const nameMatches = [...xmlText.matchAll(/<자치법규명한글>([^<]+)<\/자치법규명한글>/g)]
    const orgMatches = [...xmlText.matchAll(/<공포기관명>([^<]+)<\/공포기관명>/g)]

    if (seqMatches.length < 2) {
      result.status = 'insufficient_ordinances'
      result.errors.push(`Found only ${seqMatches.length} ordinances`)
      result.durationMs = Date.now() - start
      return result
    }

    const ordinances = seqMatches.slice(0, 3).map((m, i) => ({
      orgShortName: orgMatches[i]?.[1] || `지자체${i+1}`,
      orgName: orgMatches[i]?.[1] || `지자체${i+1}`,
      ordinanceName: nameMatches[i]?.[1] || '주민자치회 조례',
      ordinanceSeq: m[1],
    }))

    const analyzeRes = await fetch(BENCHMARK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '주민자치회', ordinances, focus: '위원 구성' }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!analyzeRes.ok) {
      result.status = 'analyze_fail'
      result.errors.push(`Analyze HTTP ${analyzeRes.status}: ${await analyzeRes.text()}`)
      result.durationMs = Date.now() - start
      return result
    }

    const data = await analyzeRes.json()
    result.hasTable = !!data.comparisonTable && data.comparisonTable.length > 50
    result.hasHighlights = !!data.highlights && data.highlights.length > 20
    result.tableLength = data.comparisonTable?.length || 0
    result.highlightsLength = data.highlights?.length || 0
    result.ordinanceCount = ordinances.length

    result.status = (result.hasTable && result.hasHighlights) ? 'pass' : 'partial'
  } catch (err) { result.errors.push(err.message); result.status = 'exception' }
  result.durationMs = Date.now() - start
  return result
}

// ─── 결과 출력 ───

function printFCRAGResult(r) {
  const toolCheck = r.quality.toolMatch ? '✅' : '❌'
  const citCheck = r.quality.citationMatch ? '✅' : '❌'
  console.log(`  [${r.id}] ${fmt(r.durationMs)} | Tools ${toolCheck} [${r.quality.toolHits.join(',')}] | Cite ${citCheck} | ${r.quality.answerQuality} | verify:${r.quality.verificationRate || '-'}`)
  if (r.errors.length) console.log(`    ⚠️ ${r.errors[0]}`)
}

// ─── 메인 ───

async function main() {
  const totalStart = Date.now()
  console.log(`=== FC-RAG E2E Test Phase 3.1 ${isParallel ? '(PARALLEL)' : '(SEQUENTIAL)'} ===\n`)

  // ── 1. FC-RAG 테스트 ──
  console.log('── FC-RAG (5 scenarios) ──')
  let fcragResults
  if (isParallel) {
    fcragResults = await Promise.all(fcragScenarios.map(s => runFCRAG(s)))
  } else {
    fcragResults = []
    for (const s of fcragScenarios) {
      fcragResults.push(await runFCRAG(s))
    }
  }
  for (const r of fcragResults) printFCRAGResult(r)

  const fcragTotalMs = fcragResults.reduce((s, r) => s + r.durationMs, 0)
  const fcragWallMs = isParallel
    ? Math.max(...fcragResults.map(r => r.durationMs))
    : fcragTotalMs

  console.log(`\n  Total CPU time: ${fmt(fcragTotalMs)} | Wall time: ${fmt(fcragWallMs)}`)

  // ── 2. AI 기능 테스트 (--fast 시 스킵) ──
  let impactResult = null
  let benchmarkResult = null

  if (!skipExtended) {
    console.log('\n── Impact Tracker ──')
    impactResult = await testImpactTracker()
    const impactIcon = impactResult.status === 'pass' ? '✅' : impactResult.status === 'partial' ? '⚠️' : '❌'
    console.log(`  ${impactIcon} ${impactResult.status} | ${fmt(impactResult.durationMs)} | items:${impactResult.itemCount || 0} changes:${impactResult.changesFound || 0} summary:${impactResult.hasSummary || false}`)
    if (impactResult.errors.length) console.log(`    ⚠️ ${impactResult.errors[0]}`)

    console.log('\n── Benchmark Analyze ──')
    benchmarkResult = await testBenchmarkAnalyze()
    const bmIcon = benchmarkResult.status === 'pass' ? '✅' : benchmarkResult.status === 'partial' ? '⚠️' : '❌'
    console.log(`  ${bmIcon} ${benchmarkResult.status} | ${fmt(benchmarkResult.durationMs)} | table:${benchmarkResult.tableLength || 0}ch highlights:${benchmarkResult.highlightsLength || 0}ch ordinances:${benchmarkResult.ordinanceCount || 0}`)
    if (benchmarkResult.errors.length) console.log(`    ⚠️ ${benchmarkResult.errors[0]}`)
  }

  // ── 종합 ──
  console.log('\n========== SUMMARY ==========\n')

  const toolOK = fcragResults.filter(r => r.quality.toolMatch).length
  const citeOK = fcragResults.filter(r => r.quality.citationMatch).length
  const highQ = fcragResults.filter(r => r.quality.answerQuality === 'high').length
  const noAns = fcragResults.filter(r => r.quality.answerQuality === 'no_answer').length

  console.log(`FC-RAG Tool Accuracy:    ${toolOK}/5`)
  console.log(`FC-RAG Citation Acc:     ${citeOK}/5`)
  console.log(`FC-RAG High Quality:     ${highQ}/5`)
  console.log(`FC-RAG No Answer:        ${noAns}/5`)
  console.log(`FC-RAG Wall Time:        ${fmt(fcragWallMs)}`)
  if (impactResult) console.log(`Impact Tracker:          ${impactResult.status}`)
  if (benchmarkResult) console.log(`Benchmark Analyze:       ${benchmarkResult.status}`)
  console.log(`Total Wall Time:         ${fmt(Date.now() - totalStart)}`)

  const fcragPass = toolOK >= 4 && citeOK >= 3 && noAns === 0
  const aiPass = skipExtended || (
    (impactResult?.status === 'pass' || impactResult?.status === 'partial') &&
    (benchmarkResult?.status === 'pass' || benchmarkResult?.status === 'partial')
  )
  console.log(`\nOverall: ${fcragPass && aiPass ? '✅ PASS' : '❌ NEEDS IMPROVEMENT'}`)
}

main().catch(console.error)
