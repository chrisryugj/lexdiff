/**
 * 각 검색 엔드포인트 E2E 테스트
 * — 홈 검색창 분류 → 엔드포인트 호출 → 결과 검증
 *
 * Usage: node scripts/test-endpoints-e2e.mjs
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000'

// 엔드포인트별 카테고리·쿼리 세트
const SUITES = [
  {
    type: 'law',
    endpoint: '/api/law-search',
    parseKind: 'xml',
    rootTag: 'law',
    cases: [
      { q: '민법', expectHit: true },
      { q: '형법', expectHit: true },
      { q: '관세법', expectHit: true },
      { q: '근로기준법', expectHit: true },
      { q: '자본시장과 금융투자업에 관한 법률', expectHit: true },
      { q: '주택임대차보호법', expectHit: true },
      { q: '도로교통법', expectHit: true },
      { q: '식품위생법', expectHit: true },
    ],
  },
  {
    type: 'ordinance',
    endpoint: '/api/ordin-search',
    parseKind: 'xml',
    rootTag: 'law',
    cases: [
      { q: '서울특별시 주차장 설치 및 관리 조례', expectHit: true },
      { q: '부산광역시 청년 기본 조례', expectHit: true },
      { q: '경기도 학교급식 지원 조례', expectHit: true },
      { q: '대구광역시 도시계획 조례', expectHit: true },
    ],
  },
  {
    type: 'admrul',
    endpoint: '/api/admrul-search',
    parseKind: 'xml',
    rootTag: 'admrul',
    cases: [
      { q: '개인정보 안전성 확보조치 기준', expectHit: true },
      { q: '행정업무의 운영 및 혁신에 관한 규정 시행규칙', expectHit: true },
      { q: '국가공무원 복무·징계 관련 예규', expectHit: true },
      { q: '건설공사 품질관리 업무지침', expectHit: true },
    ],
  },
  {
    type: 'precedent',
    endpoint: '/api/precedent-search',
    parseKind: 'json',
    countKey: 'totalCount',
    listKey: 'precedents',
    cases: [
      { q: '명예훼손', expectHit: true },
      { q: '부당해고', expectHit: true },
      { q: '대법원 2023', expectHit: true },
      { q: '2020다12345', expectHit: false }, // 없을 수도
    ],
  },
  {
    type: 'interpretation',
    endpoint: '/api/interpretation-search',
    parseKind: 'json',
    countKey: 'totalCount',
    listKey: 'interpretations',
    cases: [
      { q: '공무원', expectHit: true },
      { q: '개인정보', expectHit: true },
      { q: '건축허가', expectHit: true },
    ],
  },
  {
    type: 'ruling',
    endpoint: '/api/ruling-search',
    parseKind: 'json',
    countKey: 'totalCount',
    listKey: 'rulings',
    cases: [
      { q: '양도소득세', expectHit: true },
      { q: '부가가치세', expectHit: true },
      { q: '법인세', expectHit: true },
    ],
  },
  {
    type: 'tax_tribunal',
    endpoint: '/api/tax-tribunal-search',
    parseKind: 'json',
    countKey: 'totalCount',
    listKey: 'decisions',
    cases: [
      { q: '양도소득세', expectHit: true },
      { q: '상속세', expectHit: true },
    ],
  },
  {
    type: 'customs',
    endpoint: '/api/customs-search',
    parseKind: 'json',
    countKey: 'totalCount',
    listKey: 'interpretations',
    cases: [
      { q: '관세', expectHit: true },
      { q: '원산지', expectHit: true },
    ],
  },
]

function countXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[\\s>]`, 'g')
  return (xml.match(re) || []).length
}
function extractTotal(xml) {
  const m = xml.match(/<totalCnt>(\d+)<\/totalCnt>/)
  return m ? parseInt(m[1], 10) : -1
}

async function runOne(suite, c) {
  const url = `${BASE}${suite.endpoint}?query=${encodeURIComponent(c.q)}`
  const t0 = Date.now()
  try {
    const r = await fetch(url)
    const ms = Date.now() - t0
    const status = r.status
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { ok: false, ms, status, q: c.q, reason: `HTTP ${status}: ${body.slice(0, 120)}` }
    }
    if (suite.parseKind === 'xml') {
      const text = await r.text()
      const total = extractTotal(text)
      const rootCount = countXmlTag(text, suite.rootTag)
      const pass = total > 0 && rootCount > 0
      return {
        ok: pass || !c.expectHit,
        ms, status, q: c.q,
        total, rootCount,
        reason: pass ? 'OK' : (c.expectHit ? 'EMPTY_RESULT' : 'OK (no hit expected)'),
      }
    } else {
      const j = await r.json()
      const total = j[suite.countKey] ?? -1
      const list = j[suite.listKey] ?? []
      const pass = total > 0 && list.length > 0
      return {
        ok: pass || !c.expectHit,
        ms, status, q: c.q,
        total, rootCount: list.length,
        reason: pass ? 'OK' : (c.expectHit ? 'EMPTY_RESULT' : 'OK (no hit expected)'),
      }
    }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, q: c.q, reason: `EXCEPTION: ${e.message}` }
  }
}

async function main() {
  console.log(`\n═══ Endpoint E2E Test @ ${BASE} ═══\n`)
  const summary = []
  for (const suite of SUITES) {
    console.log(`\n━━━ ${suite.type.toUpperCase()} (${suite.endpoint}) ━━━`)
    let pass = 0, fail = 0
    for (const c of suite.cases) {
      const r = await runOne(suite, c)
      const mark = r.ok ? 'PASS' : 'FAIL'
      console.log(`  [${mark}] "${c.q}" — total=${r.total ?? '-'} list=${r.rootCount ?? '-'} ${r.ms}ms — ${r.reason}`)
      if (r.ok) pass++; else fail++
    }
    summary.push({ type: suite.type, pass, fail, total: suite.cases.length })
  }
  console.log('\n═══ SUMMARY ═══')
  let totalPass = 0, totalAll = 0
  for (const s of summary) {
    const mark = s.fail === 0 ? 'OK' : 'NG'
    console.log(`  [${mark}] ${s.type.padEnd(15)} ${s.pass}/${s.total}`)
    totalPass += s.pass; totalAll += s.total
  }
  console.log(`\n  TOTAL: ${totalPass}/${totalAll} (${Math.round(totalPass/totalAll*100)}%)`)
  if (totalPass < totalAll) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
