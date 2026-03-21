#!/usr/bin/env node
/**
 * FC-RAG E2E — 공무원 실무 질의 10개 시나리오
 * 실제 공무원이 업무 중 검색할 법한 질의로 파이프라인 검증.
 *
 * Usage:
 *   node scripts/e2e-civil-servant.mjs              # 순차 실행
 *   node scripts/e2e-civil-servant.mjs --parallel    # 병렬 실행
 *   node scripts/e2e-civil-servant.mjs --pick 1,3,5  # 특정 시나리오만
 */

const BASE_URL = 'http://localhost:3000/api/fc-rag'
const isParallel = process.argv.includes('--parallel')
const pickArg = process.argv.find(a => a.startsWith('--pick'))
const pickIds = pickArg ? pickArg.split('=')[1]?.split(',').map(Number) : null

const scenarios = [
  {
    id: 1, name: '겸직허가',
    query: '공무원 겸직허가 기준과 절차',
    expectedCitations: ['국가공무원법'],
    minAnswerLen: 200,
  },
  {
    id: 2, name: '출장비',
    query: '공무원 국내출장 일비 숙박비 지급 기준',
    expectedCitations: ['공무원 여비 규정'],
    minAnswerLen: 150,
  },
  {
    id: 3, name: '연가일수',
    query: '공무원 연가 일수 계산 방법',
    expectedCitations: ['국가공무원 복무규정'],
    minAnswerLen: 200,
  },
  {
    id: 4, name: '징계감경',
    query: '공무원 징계 감경 사유와 기준',
    expectedCitations: ['국가공무원법'],
    minAnswerLen: 200,
  },
  {
    id: 5, name: '정보공개',
    query: '정보공개 청구 처리 기한과 비공개 사유',
    expectedCitations: ['정보공개'],
    minAnswerLen: 200,
  },
  {
    id: 6, name: '민원처리',
    query: '민원 처리 법정 기한 종류',
    expectedCitations: ['민원'],
    minAnswerLen: 150,
  },
  {
    id: 7, name: '보조금반환',
    query: '보조금 교부결정 취소 및 반환 사유',
    expectedCitations: ['보조금'],
    minAnswerLen: 200,
  },
  {
    id: 8, name: '사례금상한',
    query: '공직자 외부강의 사례금 상한액',
    expectedCitations: ['청탁금지법', '공직자'],
    minAnswerLen: 150,
  },
  {
    id: 9, name: '계약해지',
    query: '지방계약 부정당업자 제재 기준',
    expectedCitations: ['계약'],
    minAnswerLen: 200,
  },
  {
    id: 10, name: '공무원연금',
    query: '공무원 퇴직연금 수급 요건',
    expectedCitations: ['공무원연금법'],
    minAnswerLen: 200,
  },
]

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

async function runScenario(s) {
  const r = {
    id: s.id, name: s.name, query: s.query,
    tools: [], answer: null, source: null,
    citationVerification: null,
    errors: [], durationMs: 0, quality: {},
  }
  const start = Date.now()
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: s.query }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) { r.errors.push(`HTTP ${res.status}`); r.durationMs = Date.now() - start; return r }
    const events = parseSSE(await res.text())
    for (const evt of events) {
      if (evt.type === 'tool_call') r.tools.push(evt.name)
      if (evt.type === 'answer') r.answer = evt.data
      if (evt.type === 'source') r.source = evt.source
      if (evt.type === 'citation_verification') r.citationVerification = evt.citations
      if (evt.type === 'error') r.errors.push(evt.message)
    }
  } catch (err) { r.errors.push(err.message) }
  r.durationMs = Date.now() - start

  // 평가
  const answerText = r.answer?.answer || ''
  const hasCitations = s.expectedCitations.some(c => answerText.includes(c))
  const longEnough = answerText.length >= s.minAnswerLen
  const confidence = r.answer?.confidenceLevel || 'none'
  const verifyRate = r.citationVerification
    ? `${r.citationVerification.filter(c => c.verified).length}/${r.citationVerification.length}`
    : '-'

  r.quality = {
    hasCitations,
    longEnough,
    confidence,
    verifyRate,
    answerLen: answerText.length,
    grade: (!r.answer || answerText.length < 50) ? 'F'
      : (!hasCitations && !longEnough) ? 'D'
      : (!hasCitations || !longEnough) ? 'C'
      : confidence === 'high' ? 'A'
      : confidence === 'medium' ? 'B'
      : 'C',
  }
  return r
}

async function main() {
  const active = pickIds
    ? scenarios.filter(s => pickIds.includes(s.id))
    : scenarios

  console.log(`=== 공무원 실무 질의 E2E (${active.length}개${isParallel ? ', 병렬' : ''}) ===\n`)

  const totalStart = Date.now()
  let results
  if (isParallel) {
    results = await Promise.all(active.map(s => runScenario(s)))
  } else {
    results = []
    for (const s of active) results.push(await runScenario(s))
  }

  // 결과 출력
  for (const r of results) {
    const g = r.quality
    const icon = g.grade === 'A' ? '🟢' : g.grade === 'B' ? '🟡' : g.grade === 'C' ? '🟠' : '🔴'
    console.log(`${icon} [${r.id}] ${r.name} (${fmt(r.durationMs)}) — Grade ${g.grade}`)
    console.log(`   Tools: ${r.tools.join(', ') || 'none'}`)
    console.log(`   Answer: ${g.answerLen}ch | Cite: ${g.hasCitations ? '✅' : '❌'} | Conf: ${g.confidence} | Verify: ${g.verifyRate}`)
    if (r.errors.length) console.log(`   ⚠️ ${r.errors[0].slice(0, 120)}`)
    if (r.answer?.warnings?.length) console.log(`   ⚠️ ${r.answer.warnings[0]}`)
    console.log()
  }

  // 종합
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const r of results) grades[r.quality.grade]++
  const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length
  const wallMs = isParallel ? Math.max(...results.map(r => r.durationMs)) : results.reduce((s, r) => s + r.durationMs, 0)

  console.log('========== SUMMARY ==========')
  console.log(`Grade A: ${grades.A} | B: ${grades.B} | C: ${grades.C} | D: ${grades.D} | F: ${grades.F}`)
  console.log(`Pass (A+B): ${grades.A + grades.B}/${results.length}`)
  console.log(`Avg: ${fmt(avgMs)} | Wall: ${fmt(wallMs)}`)
  console.log(`Overall: ${(grades.A + grades.B) >= results.length * 0.7 ? '✅ PASS' : '❌ NEEDS WORK'}`)
}

main().catch(console.error)
