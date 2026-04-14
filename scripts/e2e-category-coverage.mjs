#!/usr/bin/env node
/**
 * FC-RAG 카테고리 커버리지 테스트
 *
 * 목적: 지원하는 모든 검색 분류에 대해 사용자 실제 쿼리로 API 호출하여
 *       분류기→도구선택→실제 API 응답까지 전 경로 검증.
 *
 * 카테고리:
 *   A. 법령 기본 5종: 법령 / 시행령 / 시행규칙 / 조례 / 행정규칙
 *   B. 17개 결정문 도메인 (decision-domains.ts)
 *
 * 사용법:
 *   node scripts/e2e-category-coverage.mjs [--parallel=5] [--only=precedent,tax_tribunal]
 */

import fs from 'node:fs'
import path from 'node:path'

// ─── .env.local 수동 로드 (GEMINI_API_KEY BYOK용) ───
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, k, v] = m
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const FC_RAG_URL = `${BASE}/api/fc-rag`
const BYOK = process.env.GEMINI_API_KEY
if (!BYOK) {
  console.error('ERR: GEMINI_API_KEY 가 .env.local 에 없음')
  process.exit(1)
}

const parallelArg = process.argv.find(a => a.startsWith('--parallel='))
const PARALLEL = parallelArg ? Number(parallelArg.split('=')[1]) : 4
const onlyArg = process.argv.find(a => a.startsWith('--only='))
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',') : null

// ─── 테스트 카테고리 정의 ───
//
// 각 시나리오는 '일반인이 법률 정보를 찾을 때' 실제로 입력할만한 쿼리.
// expectedToolPatterns: tool_call 이벤트 displayName 에 하나라도 매칭되면 통과.
// expectedKeywords: answer 텍스트에 하나라도 포함되면 통과(느슨한 조건).

const SCENARIOS = [
  // ─── A. 법령 기본 5종 ───
  {
    id: 'statute', category: '법령',
    query: '임금체불 하면 사업주 어떤 처벌 받아?',
    expectedToolPatterns: [/법령\s*검색|AI\s*법령/],
    expectedKeywords: ['근로기준법'],
  },
  {
    id: 'enforcement_decree', category: '시행령',
    query: '근로기준법 시행령에서 연차휴가 산정방법',
    expectedToolPatterns: [/법령|시행령|위임/],
    expectedKeywords: ['시행령', '연차'],
  },
  {
    id: 'enforcement_rule', category: '시행규칙',
    query: '도로교통법 시행규칙 운전면허 적성검사 주기',
    expectedToolPatterns: [/법령|시행규칙/],
    expectedKeywords: ['시행규칙', '적성검사'],
  },
  {
    id: 'ordinance', category: '조례',
    query: '서울시 주차장 설치 기준 조례',
    expectedToolPatterns: [/조례|자치법규/],
    expectedKeywords: ['조례'],
  },
  {
    id: 'admin_rule', category: '행정규칙',
    query: '국세청 상속세 재산평가 훈령',
    expectedToolPatterns: [/행정규칙|훈령|법령/],
    expectedKeywords: ['상속세'],
  },

  // ─── B. 17개 결정문 도메인 ───
  {
    id: 'precedent', category: '판례',
    query: '교통사고 위자료 산정 대법원 판례',
    expectedToolPatterns: [/판례\s*검색/],
    expectedKeywords: ['판례'],
  },
  {
    id: 'interpretation', category: '법령해석례',
    query: '인허가 의제 제도 법제처 유권해석',
    expectedToolPatterns: [/해석례\s*검색|법령해석례\s*검색/],
    expectedKeywords: ['해석'],
  },
  {
    id: 'tax_tribunal', category: '조세심판원 재결례',
    query: '부가가치세 매입세액 불공제 조세심판 사례',
    expectedToolPatterns: [/조세심판.*검색/],
    expectedKeywords: ['부가가치세'],
  },
  {
    id: 'customs', category: '관세청 법령해석',
    query: '한미 FTA 원산지증명서 특혜관세 관세청 해석',
    expectedToolPatterns: [/관세.*검색/],
    expectedKeywords: ['관세'],
  },
  {
    id: 'constitutional', category: '헌법재판소 결정례',
    query: '양심적 병역거부 헌법재판소 결정',
    expectedToolPatterns: [/헌법재판소|헌재/],
    expectedKeywords: ['헌법'],
  },
  {
    id: 'admin_appeal', category: '행정심판례',
    query: '운전면허 취소처분 행정심판 재결 사례',
    expectedToolPatterns: [/행정심판/],
    expectedKeywords: ['행정심판'],
  },
  {
    id: 'ftc', category: '공정거래위원회 결정문',
    query: '가맹본부 불공정거래 공정거래위원회 의결 사례',
    expectedToolPatterns: [/공정거래|공정위/],
    expectedKeywords: ['공정거래'],
  },
  {
    id: 'pipc', category: '개인정보보호위원회 결정문',
    query: '개인정보 유출 과징금 개인정보보호위 의결',
    expectedToolPatterns: [/개인정보/],
    expectedKeywords: ['개인정보'],
  },
  {
    id: 'nlrc', category: '노동위원회 결정문',
    query: '부당해고 구제신청 노동위원회 판정',
    expectedToolPatterns: [/노동위/],
    expectedKeywords: ['해고'],
  },
  {
    id: 'acr', category: '국민권익위원회 결정문',
    query: '공공기관 고충민원 국민권익위원회 결정',
    expectedToolPatterns: [/권익위|국민권익/],
    expectedKeywords: ['권익'],
  },
  {
    id: 'appeal_review', category: '소청심사 재결례',
    query: '공무원 징계 소청심사 재결',
    expectedToolPatterns: [/소청/],
    expectedKeywords: ['소청'],
  },
  {
    id: 'acr_special', category: '권익위 특별행정심판',
    query: '권익위 특별행정심판 재결 사례',
    expectedToolPatterns: [/특별.*행정심판|특별심판/],
    expectedKeywords: ['심판'],
  },
  {
    id: 'school', category: '학칙',
    query: '서울대학교 졸업요건 학칙',
    expectedToolPatterns: [/학칙/],
    expectedKeywords: ['학칙'],
  },
  {
    id: 'public_corp', category: '공사공단 규정',
    query: '한국전력공사 인사 내부규정',
    expectedToolPatterns: [/공사공단|공사.*규정/],
    expectedKeywords: ['규정'],
  },
  {
    id: 'public_inst', category: '공공기관 규정',
    query: '한국연구재단 연구비 공공기관 내부규정',
    expectedToolPatterns: [/공공기관.*규정/],
    expectedKeywords: ['규정'],
  },
  {
    id: 'treaty', category: '조약',
    query: '한미 자유무역협정 FTA 조약문',
    expectedToolPatterns: [/조약/],
    expectedKeywords: ['조약', 'FTA'],
  },
  {
    id: 'english_law', category: '영문법령',
    query: 'Personal Information Protection Act English translation',
    expectedToolPatterns: [/영문/],
    expectedKeywords: ['Personal', 'Information'],
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
const fmt = ms => (ms / 1000).toFixed(1) + 's'
const truncate = (s, n = 80) => (s || '').replace(/\s+/g, ' ').slice(0, n)

// ─── 한 시나리오 실행 ───

async function runScenario(s) {
  const r = {
    id: s.id, category: s.category, query: s.query,
    tools: [], toolDisplays: [], toolResults: [], answer: null,
    answerText: '', source: null, errors: [], durationMs: 0,
    quality: {},
  }
  const start = Date.now()
  try {
    const res = await fetch(FC_RAG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-api-key': BYOK },
      body: JSON.stringify({ query: s.query }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) {
      r.errors.push(`HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    } else {
    const events = parseSSE(await res.text())
    for (const evt of events) {
      if (evt.type === 'tool_call') {
        r.tools.push(evt.name)
        r.toolDisplays.push(evt.displayName || evt.name)
      }
      if (evt.type === 'tool_result') {
        r.toolResults.push({ name: evt.name, display: evt.displayName, success: evt.success, summary: truncate(evt.summary, 120) })
      }
      if (evt.type === 'answer') {
        r.answer = evt.data
        r.answerText = evt.data?.answer || ''
      }
      if (evt.type === 'source') r.source = evt.source
      if (evt.type === 'error') r.errors.push(evt.message)
    }
    }
  } catch (err) {
    r.errors.push(err.message)
  }
  r.durationMs = Date.now() - start

  // 평가
  const toolDisplayBlob = r.toolDisplays.join(' | ')
  const toolHit = s.expectedToolPatterns.some(p => p.test(toolDisplayBlob))
  const keywordHits = s.expectedKeywords.filter(k => r.answerText.includes(k))
  const keywordHit = keywordHits.length > 0
  const hasAnswer = r.answerText.length >= 50

  // tool_result 중 실패한 것(검색 0건 또는 error) 집계
  const failedTools = r.toolResults.filter(t => !t.success).map(t => t.display)
  const emptyResults = r.toolResults.filter(t =>
    t.success && /(?:^|\D)0건|없음|결과가\s*없|no results|empty/i.test(t.summary)
  ).map(t => t.display)

  r.quality = {
    toolHit, keywordHit, hasAnswer,
    keywordHits,
    failedTools,
    emptyResults,
    pass: toolHit && keywordHit && hasAnswer && r.errors.length === 0,
  }
  return r
}

// ─── 병렬 배치 실행 ───

async function runBatched(items, size, fn) {
  const results = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    console.log(`\n── Batch ${Math.floor(i / size) + 1}/${Math.ceil(items.length / size)} (${batch.map(s => s.id).join(', ')}) ──`)
    const batchRes = await Promise.all(batch.map(fn))
    for (const r of batchRes) {
      const icon = r.quality.pass ? '✅' : r.errors.length ? '💥' : '⚠️'
      console.log(
        `  ${icon} [${r.id.padEnd(18)}] ${fmt(r.durationMs).padStart(6)} | ` +
        `tool:${r.quality.toolHit ? '✓' : '✗'} kw:${r.quality.keywordHit ? '✓' : '✗'}(${r.quality.keywordHits.join(',') || '-'}) | ` +
        `tools=[${r.toolDisplays.slice(0, 3).join(',')}${r.toolDisplays.length > 3 ? '...' : ''}]`
      )
      if (r.errors.length) console.log(`     💥 ${r.errors[0]}`)
      if (r.quality.emptyResults.length) console.log(`     ⚠️  empty: ${r.quality.emptyResults.join(', ')}`)
    }
    results.push(...batchRes)
  }
  return results
}

// ─── 메인 ───

async function main() {
  const start = Date.now()
  const targets = ONLY ? SCENARIOS.filter(s => ONLY.includes(s.id)) : SCENARIOS
  console.log(`=== FC-RAG Category Coverage Test ===`)
  console.log(`Scenarios: ${targets.length} | Parallel: ${PARALLEL} | Base: ${BASE}\n`)

  const results = await runBatched(targets, PARALLEL, runScenario)

  // ─── 종합 보고 ───
  console.log('\n\n========== SUMMARY ==========\n')
  const total = results.length
  const passed = results.filter(r => r.quality.pass).length
  const toolOK = results.filter(r => r.quality.toolHit).length
  const kwOK = results.filter(r => r.quality.keywordHit).length
  const ansOK = results.filter(r => r.quality.hasAnswer).length
  const err = results.filter(r => r.errors.length).length

  console.log(`Overall Pass:      ${passed}/${total}`)
  console.log(`Correct Tool:      ${toolOK}/${total}`)
  console.log(`Keyword Match:     ${kwOK}/${total}`)
  console.log(`Has Answer:        ${ansOK}/${total}`)
  console.log(`HTTP/Stream Error: ${err}/${total}`)
  console.log(`Wall Time:         ${fmt(Date.now() - start)}`)

  // 실패/이슈 상세
  const failures = results.filter(r => !r.quality.pass)
  if (failures.length) {
    console.log('\n── 이슈 상세 ──')
    for (const r of failures) {
      console.log(`\n[${r.id}] ${r.category}`)
      console.log(`  Query:  ${r.query}`)
      console.log(`  Tools:  ${r.toolDisplays.join(', ') || '(none)'}`)
      if (r.quality.emptyResults.length) console.log(`  Empty:  ${r.quality.emptyResults.join(', ')}`)
      if (!r.quality.keywordHit) console.log(`  Answer: ${truncate(r.answerText, 160) || '(no answer)'}`)
      if (r.errors.length) console.log(`  Error:  ${r.errors[0]}`)
    }
  }

  // JSON 결과도 저장
  const outPath = path.resolve('scripts/e2e-category-coverage.last.json')
  fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
  console.log(`\n결과 저장: ${outPath}`)

  process.exit(passed === total ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
