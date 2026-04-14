/**
 * 의도(Intent) vs 실제결과(Actual) 통합 검증
 *
 * 각 쿼리에 대해:
 *  1. Intent: 사용자가 기대하는 카테고리 + 기대 Top-N 매칭 문자열
 *  2. Classifier: 실제 분류 결과 (type, confidence, reason)
 *  3. Endpoint: 분류된(또는 의도된) 엔드포인트 호출 후 Top-5에 기대 매칭 포함 여부
 *
 * 리포트:
 *  - CLASSIFY_FAIL: 의도와 다른 카테고리로 분류됨
 *  - RESULT_FAIL: 엔드포인트 응답에 의도된 결과 없음
 *  - BOTH_FAIL: 둘 다 실패
 *
 * Usage: npx tsx scripts/test-intent-vs-result.mts
 */

import { classifySearchQuery } from '../src/domain/search/services/QueryClassifier'

const BASE = process.env.BASE_URL || 'http://localhost:3000'

type IntentType =
  | 'law' | 'ordinance' | 'admrul'
  | 'precedent' | 'ruling' | 'interpretation'
  | 'tax_tribunal' | 'customs' | 'ai'

interface Case {
  q: string
  intent: IntentType
  /** 기대 매칭: Top-5 결과의 name/title 안에 이 문자열(들) 중 하나가 포함돼야 */
  topMatch?: string | string[]
  /** classifier 가 이 타입으로 분류될 것을 요구 (intent와 다를 수 있음 — alias) */
  classifyAs?: IntentType | IntentType[]
  /** 의도와 classify가 달라도 엔드포인트는 classify 기준으로 요청 */
  note?: string
}

// intent → endpoint URL
const ENDPOINT: Record<Exclude<IntentType, 'ai'>, { url: string; parser: 'xml-law' | 'xml-admrul' | 'json' }> = {
  law:            { url: '/api/law-search',            parser: 'xml-law'    },
  ordinance:      { url: '/api/ordin-search',          parser: 'xml-law'    },
  admrul:         { url: '/api/admrul-search',         parser: 'xml-admrul' },
  precedent:      { url: '/api/precedent-search',      parser: 'json'       },
  ruling:         { url: '/api/ruling-search',         parser: 'json'       },
  interpretation: { url: '/api/interpretation-search', parser: 'json'       },
  tax_tribunal:   { url: '/api/tax-tribunal-search',   parser: 'json'       },
  customs:        { url: '/api/customs-search',        parser: 'json'       },
}

// ────────────────────────────────────────────────────────────
// TEST CASES — intent + expected top match
// ────────────────────────────────────────────────────────────
const CASES: Case[] = [
  // ─── 법률 ───
  { q: '민법',                                      intent: 'law', topMatch: '민법' },
  { q: '형법',                                      intent: 'law', topMatch: '형법' },
  { q: '근로기준법',                                intent: 'law', topMatch: '근로기준법' },
  { q: '상법',                                      intent: 'law', topMatch: '상법' },
  { q: '도로교통법',                                intent: 'law', topMatch: '도로교통법' },
  { q: '주택임대차보호법',                          intent: 'law', topMatch: '주택임대차보호법' },
  { q: '자본시장과 금융투자업에 관한 법률',          intent: 'law', topMatch: '자본시장' },
  { q: '소득세법',                                  intent: 'law', topMatch: '소득세법' },
  { q: '국가공무원법',                              intent: 'law', topMatch: '국가공무원법' },
  { q: '개인정보 보호법',                           intent: 'law', topMatch: '개인정보' },

  // ─── 시행령 / 시행규칙 ───
  { q: '민법 시행령',                               intent: 'law', topMatch: '민법' },
  { q: '도로교통법 시행규칙',                       intent: 'law', topMatch: '도로교통법' },
  { q: '근로기준법 시행령',                         intent: 'law', topMatch: '근로기준법' },

  // ─── 조례 ───
  { q: '서울특별시 주차장 설치 및 관리 조례',        intent: 'ordinance', topMatch: ['주차장', '서울'] },
  { q: '부산광역시 청년 기본 조례',                  intent: 'ordinance', topMatch: ['청년', '부산'] },
  { q: '경기도 학교급식 지원 조례',                  intent: 'ordinance', topMatch: ['학교급식', '경기'] },
  { q: '대구광역시 도시계획 조례',                   intent: 'ordinance', topMatch: ['도시계획', '대구'] },
  { q: '인천광역시 청소년 보호 조례',                intent: 'ordinance', topMatch: ['청소년', '인천'] },

  // ─── 행정규칙 (훈령/예규/고시/지침) ───
  { q: '개인정보 안전성 확보조치 기준',              intent: 'admrul', topMatch: '개인정보 안전성' },
  { q: '국가공무원 복무·징계 관련 예규',             intent: 'admrul', topMatch: '공무원' },
  { q: '건설공사 품질관리 업무지침',                 intent: 'admrul', topMatch: '품질관리' },

  // ─── 판례 ───
  // "명예훼손"/"부당해고" 단독 키워드는 law/precedent 양쪽 합리적 — classifyAs 에 모두 허용
  { q: '명예훼손',          intent: 'precedent', topMatch: '명예', classifyAs: ['precedent', 'law'] },
  { q: '부당해고',          intent: 'precedent', topMatch: '해고', classifyAs: ['precedent', 'law'] },
  // 법원명+연도: classifier는 판례로 분류, endpoint 결과의 사건명엔 법원명이 없어도 OK (total>0 만 체크)
  { q: '대법원 2023',       intent: 'precedent', classifyAs: 'precedent' },
  // 실존 미보장 사건번호: 분류만 판례로 되면 OK (결과 empty 허용)
  { q: '2020다12345',       intent: 'precedent', classifyAs: 'precedent' },

  // ─── 재결례 (조세심판원) ───
  { q: '양도소득세 재결례',                          intent: 'ruling', topMatch: '양도' },
  { q: '부가가치세 재결례',                          intent: 'ruling', topMatch: '부가가치' },

  // ─── 법령해석례 ───
  { q: '공무원 법령해석례',                          intent: 'interpretation', topMatch: '공무원' },
  { q: '개인정보 법령해석례',                        intent: 'interpretation', topMatch: '개인정보' },
  { q: '건축허가 법령해석례',                        intent: 'interpretation', topMatch: '건축' },

  // ─── AI 자연어 ───
  { q: '공무원이 겸직할 수 있나요',                  intent: 'ai', classifyAs: 'ai', note: '~나요 종결' },
  { q: '부당해고 당하면 어떻게 해야 하나요',          intent: 'ai', classifyAs: 'ai' },
  { q: '임대차 보증금 못 받으면 어떻게 하나요',       intent: 'ai', classifyAs: 'ai' },
  { q: '음주운전 처벌 기준 알려줘',                  intent: 'ai', classifyAs: 'ai' },
]

// ────────────────────────────────────────────────────────────
// Parsers
// ────────────────────────────────────────────────────────────
function extractXmlItems(xml: string, tag: string, nameTag: string): { name: string }[] {
  const items: { name: string }[] = []
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'g')
  const matches = xml.match(re) || []
  for (const m of matches) {
    const cdata = m.match(new RegExp(`<${nameTag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${nameTag}>`))
    const plain = m.match(new RegExp(`<${nameTag}>([^<]*)</${nameTag}>`))
    const name = cdata?.[1] || plain?.[1] || ''
    if (name) items.push({ name: name.trim() })
  }
  return items
}

async function fetchTop(intent: Exclude<IntentType, 'ai'>, q: string): Promise<{ ok: boolean; items: string[]; total: number; reason?: string }> {
  const ep = ENDPOINT[intent]
  const url = `${BASE}${ep.url}?query=${encodeURIComponent(q)}&display=10`
  try {
    const r = await fetch(url)
    if (!r.ok) return { ok: false, items: [], total: -1, reason: `HTTP ${r.status}` }
    if (ep.parser === 'xml-law') {
      const text = await r.text()
      const totalM = text.match(/<totalCnt>(\d+)<\/totalCnt>/)
      const total = totalM ? parseInt(totalM[1], 10) : 0
      // law target: <법령명한글>, ordin target: <자치법규명> — 둘 다 루트 태그는 <law>
      const items = [
        ...extractXmlItems(text, 'law', '법령명한글'),
        ...extractXmlItems(text, 'law', '자치법규명'),
      ].map(x => x.name)
      return { ok: true, items, total }
    }
    if (ep.parser === 'xml-admrul') {
      const text = await r.text()
      const totalM = text.match(/<totalCnt>(\d+)<\/totalCnt>/)
      const total = totalM ? parseInt(totalM[1], 10) : 0
      const items = extractXmlItems(text, 'admrul', '행정규칙명').map(x => x.name)
      return { ok: true, items, total }
    }
    // json
    const j = await r.json() as any
    const list = j.precedents || j.rulings || j.interpretations || j.decisions || []
    const items = list.map((x: any) => x.name || x.title || '').filter(Boolean)
    return { ok: true, items, total: j.totalCount ?? items.length }
  } catch (e: any) {
    return { ok: false, items: [], total: -1, reason: `EXC ${e.message}` }
  }
}

function matchesAny(items: string[], needles: string | string[]): boolean {
  const arr = Array.isArray(needles) ? needles : [needles]
  const top5 = items.slice(0, 5)
  return arr.some(n => top5.some(it => it.includes(n)))
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
interface Report {
  q: string
  intent: IntentType
  classifiedAs: string
  confidence: number
  classReason: string
  classifyOK: boolean
  resultOK: boolean | null // null = ai (skip)
  items: string[]
  total: number
  expectMatch?: string | string[]
  failKind?: 'CLASSIFY' | 'RESULT' | 'BOTH' | null
}

async function main() {
  console.log(`\n═══ Intent vs Actual 통합 검증 @ ${BASE} ═══\n`)
  const reports: Report[] = []

  for (const c of CASES) {
    const cls = classifySearchQuery(c.q)
    const classifiedAs = cls.searchType

    const expectedClassify = c.classifyAs
      ? (Array.isArray(c.classifyAs) ? c.classifyAs : [c.classifyAs])
      : [c.intent]
    const classifyOK = expectedClassify.includes(classifiedAs as IntentType)

    let resultOK: boolean | null = null
    let items: string[] = []
    let total = -1
    // topMatch 명시된 케이스만 결과 내용 검증 — classifyAs만 설정된 케이스는 분류 확인이 목적
    if (c.intent !== 'ai' && c.topMatch) {
      const fetched = await fetchTop(c.intent, c.q)
      items = fetched.items
      total = fetched.total
      if (!fetched.ok) resultOK = false
      else resultOK = matchesAny(items, c.topMatch)
    }

    let failKind: Report['failKind'] = null
    if (!classifyOK && resultOK === false) failKind = 'BOTH'
    else if (!classifyOK) failKind = 'CLASSIFY'
    else if (resultOK === false) failKind = 'RESULT'

    reports.push({
      q: c.q,
      intent: c.intent,
      classifiedAs,
      confidence: cls.confidence,
      classReason: cls.reason,
      classifyOK,
      resultOK,
      items,
      total,
      expectMatch: c.topMatch,
      failKind,
    })
  }

  // 출력
  for (const r of reports) {
    const cMark = r.classifyOK ? 'OK' : 'NG'
    const rMark = r.resultOK === null ? '--' : (r.resultOK ? 'OK' : 'NG')
    const tag = r.failKind ? ` [${r.failKind}]` : ''
    console.log(`[CLS:${cMark}|RES:${rMark}]${tag} "${r.q}"`)
    console.log(`     intent=${r.intent} → classified=${r.classifiedAs} (conf=${r.confidence.toFixed(2)}, ${r.classReason})`)
    if (r.resultOK !== null) {
      const expected = Array.isArray(r.expectMatch) ? r.expectMatch.join('|') : (r.expectMatch || '-')
      console.log(`     total=${r.total}, expect[top5 contains]="${expected}"`)
      console.log(`     top5 = ${r.items.slice(0, 5).map(s => s.length > 30 ? s.slice(0, 30) + '…' : s).join(' / ') || '(empty)'}`)
    }
  }

  // 집계
  const classifyPass = reports.filter(r => r.classifyOK).length
  const resultTested = reports.filter(r => r.resultOK !== null)
  const resultPass = resultTested.filter(r => r.resultOK === true).length
  const bothFail = reports.filter(r => r.failKind === 'BOTH').length
  const classFail = reports.filter(r => r.failKind === 'CLASSIFY').length
  const resultFail = reports.filter(r => r.failKind === 'RESULT').length

  console.log('\n═══ SUMMARY ═══')
  console.log(`  Classifier  : ${classifyPass}/${reports.length} (${Math.round(classifyPass/reports.length*100)}%)`)
  console.log(`  Endpoint    : ${resultPass}/${resultTested.length} (${Math.round(resultPass/resultTested.length*100)}%)`)
  console.log(`  FAIL breakdown: CLASSIFY=${classFail} RESULT=${resultFail} BOTH=${bothFail}`)

  if (classFail + resultFail + bothFail > 0) {
    console.log('\n─── 실패 케이스 상세 ───')
    for (const r of reports.filter(x => x.failKind)) {
      console.log(`  [${r.failKind}] "${r.q}"`)
      console.log(`      intent=${r.intent}, classified=${r.classifiedAs} (${r.classReason})`)
      if (r.resultOK !== null) {
        console.log(`      top5=${r.items.slice(0,5).join(' | ') || '(empty)'}`)
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
