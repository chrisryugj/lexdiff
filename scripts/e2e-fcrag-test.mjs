#!/usr/bin/env node
/**
 * FC-RAG E2E Quality Test — Phase 3
 * 5개 도메인 시나리오를 dev 서버(localhost:3000)에서 실행하여
 * 도구 선택, 답변 품질, 인용 정확성을 검증.
 */

const BASE_URL = 'http://localhost:3000/api/fc-rag'

const scenarios = [
  {
    id: 'customs',
    query: '수입물품 과세가격 결정방법',
    expectedDomain: 'customs',
    expectedTools: ['search_ai_law', 'chain_action_basis', 'search_customs_interpretations'],
    expectedCitations: ['관세법', '제30조'],
  },
  {
    id: 'labor',
    query: '해고예고수당 미지급 시 벌칙',
    expectedDomain: 'labor',
    expectedTools: ['search_ai_law', 'search_precedents', 'get_batch_articles'],
    expectedCitations: ['근로기준법', '제26조', '제110조'],
  },
  {
    id: 'tax',
    query: '양도소득세 1세대 1주택 비과세 요건',
    expectedDomain: 'tax',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: ['소득세법', '제89조'],
  },
  {
    id: 'public_servant',
    query: '공무원 휴직 종류와 기간',
    expectedDomain: 'public_servant',
    expectedTools: ['search_ai_law', 'get_batch_articles'],
    expectedCitations: ['국가공무원법', '제71조'],
  },
  {
    id: 'construction',
    query: '서울시 주차장 설치 기준',
    expectedDomain: 'construction',
    expectedTools: ['search_ai_law', 'search_ordinance', 'chain_ordinance_compare'],
    expectedCitations: ['주차장법'],
  },
]

function parseSSE(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        events.push(JSON.parse(line.slice(6)))
      } catch { /* skip malformed */ }
    }
  }
  return events
}

async function runScenario(scenario) {
  const result = {
    id: scenario.id,
    query: scenario.query,
    tools: [],
    toolResults: [],
    answer: null,
    citations: [],
    citationVerification: null,
    source: null,
    errors: [],
    tokenUsage: null,
    quality: { toolMatch: false, citationMatch: false, answerQuality: 'unknown' },
    durationMs: 0,
  }

  const start = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: scenario.query }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      result.errors.push(`HTTP ${response.status}: ${await response.text()}`)
      result.durationMs = Date.now() - start
      return result
    }

    const text = await response.text()
    const events = parseSSE(text)

    for (const evt of events) {
      switch (evt.type) {
        case 'tool_call':
          result.tools.push({ name: evt.name, displayName: evt.displayName, query: evt.query })
          break
        case 'tool_result':
          result.toolResults.push({ name: evt.name, success: evt.success, summary: evt.summary })
          break
        case 'answer':
          result.answer = evt.data
          result.citations = evt.data?.citations || []
          break
        case 'citation_verification':
          result.citationVerification = evt.citations
          break
        case 'source':
          result.source = evt.source
          break
        case 'token_usage':
          result.tokenUsage = evt
          break
        case 'error':
          result.errors.push(evt.message)
          break
      }
    }
  } catch (err) {
    result.errors.push(err.message)
  }

  result.durationMs = Date.now() - start

  // ── 품질 평가 ──

  // 1. 도구 선택 정확성 (기대 도구 중 최소 1개 호출됐는지)
  const calledNames = new Set(result.tools.map(t => t.name))
  const toolHits = scenario.expectedTools.filter(t => calledNames.has(t))
  result.quality.toolMatch = toolHits.length > 0
  result.quality.toolHits = toolHits
  result.quality.toolMisses = scenario.expectedTools.filter(t => !calledNames.has(t))

  // 2. 인용 정확성 (답변에 기대 키워드 포함 여부)
  const answerText = result.answer?.answer || ''
  const citationHits = scenario.expectedCitations.filter(c => answerText.includes(c))
  result.quality.citationMatch = citationHits.length === scenario.expectedCitations.length
  result.quality.citationHits = citationHits
  result.quality.citationMisses = scenario.expectedCitations.filter(c => !answerText.includes(c))

  // 3. 답변 품질 (길이 + confidence + quality gate)
  if (!result.answer) {
    result.quality.answerQuality = 'no_answer'
  } else if (answerText.length < 50) {
    result.quality.answerQuality = 'too_short'
  } else if (result.answer.confidenceLevel === 'low') {
    result.quality.answerQuality = 'low_confidence'
  } else if (result.answer.confidenceLevel === 'high') {
    result.quality.answerQuality = 'high'
  } else {
    result.quality.answerQuality = 'medium'
  }

  // 4. 인용 검증 통과율
  if (result.citationVerification) {
    const verified = result.citationVerification.filter(c => c.verified)
    result.quality.verificationRate = `${verified.length}/${result.citationVerification.length}`
  }

  return result
}

async function main() {
  console.log('=== FC-RAG E2E Quality Test Phase 3 ===\n')
  console.log(`Target: ${BASE_URL}`)
  console.log(`Scenarios: ${scenarios.length}\n`)

  const results = []

  for (const scenario of scenarios) {
    console.log(`\n─── [${scenario.id}] ${scenario.query} ───`)
    const result = await runScenario(scenario)
    results.push(result)

    // 실시간 결과 출력
    console.log(`  Source: ${result.source || 'none'}`)
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`)
    console.log(`  Tools called: ${result.tools.map(t => t.name).join(', ') || 'none'}`)
    console.log(`  Tool match: ${result.quality.toolMatch ? '✅' : '❌'} (hits: ${result.quality.toolHits?.join(', ') || 'none'})`)
    if (result.quality.toolMisses?.length > 0) {
      console.log(`  Tool misses: ${result.quality.toolMisses.join(', ')}`)
    }
    console.log(`  Answer length: ${result.answer?.answer?.length || 0} chars`)
    console.log(`  Answer quality: ${result.quality.answerQuality}`)
    console.log(`  Confidence: ${result.answer?.confidenceLevel || 'none'}`)
    console.log(`  Citations: ${result.citations.length}`)
    console.log(`  Citation match: ${result.quality.citationMatch ? '✅' : '❌'} (hits: ${result.quality.citationHits?.join(', ') || 'none'})`)
    if (result.quality.citationMisses?.length > 0) {
      console.log(`  Citation misses: ${result.quality.citationMisses.join(', ')}`)
    }
    if (result.quality.verificationRate) {
      console.log(`  Verification: ${result.quality.verificationRate}`)
    }
    if (result.tokenUsage) {
      console.log(`  Tokens: in=${result.tokenUsage.inputTokens} out=${result.tokenUsage.outputTokens}`)
    }
    if (result.errors.length > 0) {
      console.log(`  ⚠️ Errors: ${result.errors.join('; ')}`)
    }
    if (result.answer?.warnings?.length > 0) {
      console.log(`  ⚠️ Warnings: ${result.answer.warnings.join('; ')}`)
    }
  }

  // ── 종합 리포트 ──
  console.log('\n\n========== SUMMARY ==========\n')

  const toolMatchCount = results.filter(r => r.quality.toolMatch).length
  const citationMatchCount = results.filter(r => r.quality.citationMatch).length
  const highQualityCount = results.filter(r => r.quality.answerQuality === 'high').length
  const noAnswerCount = results.filter(r => r.quality.answerQuality === 'no_answer').length
  const errorCount = results.filter(r => r.errors.length > 0).length
  const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length

  console.log(`Tool Selection Accuracy:   ${toolMatchCount}/${results.length}`)
  console.log(`Citation Accuracy:         ${citationMatchCount}/${results.length}`)
  console.log(`High Quality Answers:      ${highQualityCount}/${results.length}`)
  console.log(`No Answer:                 ${noAnswerCount}/${results.length}`)
  console.log(`Errors:                    ${errorCount}/${results.length}`)
  console.log(`Avg Duration:              ${(avgDuration / 1000).toFixed(1)}s`)

  // Pass/Fail
  const passed = toolMatchCount >= 4 && citationMatchCount >= 3 && noAnswerCount === 0
  console.log(`\nOverall: ${passed ? '✅ PASS' : '❌ NEEDS IMPROVEMENT'}`)

  // JSON 결과 저장
  const fs = await import('fs')
  const path = await import('path')
  const outDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '.claude')
  try { fs.mkdirSync(outDir, { recursive: true }) } catch {}
  const outPath = path.join(outDir, 'e2e-results.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`\nDetailed results: ${outPath}`)
}

main().catch(console.error)
