#!/usr/bin/env node
/**
 * FC-RAG E2E — 공무원 실무 + 법률자문 60개 종합 테스트
 *
 * 9개 카테고리 (공무원 실무 50 + 사내 변호사 자문 10)
 * 분류기(domain/queryType/complexity) + 응답 품질 + 도구 적합성 평가.
 *
 * Usage:
 *   node scripts/e2e-civil-servant-50.mjs                    # 순차 (5개씩 배치)
 *   node scripts/e2e-civil-servant-50.mjs --parallel         # 5개 배치 병렬
 *   node scripts/e2e-civil-servant-50.mjs --pick 1,2,3       # 특정 ID만
 *   node scripts/e2e-civil-servant-50.mjs --cat 인사         # 특정 카테고리만
 *   node scripts/e2e-civil-servant-50.mjs --batch 3          # 배치 크기 변경
 *   node scripts/e2e-civil-servant-50.mjs --failures-only    # F/D만 재실행
 *   node scripts/e2e-civil-servant-50.mjs --save             # 결과 JSON 저장
 */

import { writeFileSync, readFileSync, existsSync } from 'fs'

const BASE_URL = process.env.FC_RAG_URL || 'http://localhost:3000/api/fc-rag'
const isParallel = process.argv.includes('--parallel')
const saveResults = process.argv.includes('--save')
const failuresOnly = process.argv.includes('--failures-only')
const pickArg = process.argv.find(a => a.startsWith('--pick'))
const pickIds = pickArg ? pickArg.split('=')[1]?.split(',').map(Number) : null
const catArg = process.argv.find(a => a.startsWith('--cat'))
const catFilter = catArg ? catArg.split('=')[1] : null
const batchArg = process.argv.find(a => a.startsWith('--batch'))
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1]) : 5
const TIMEOUT_MS = 300_000
const RESULTS_FILE = 'scripts/e2e-results-50.json'

// ─── 50개 시나리오 ───

const scenarios = [
  // ══════ 1. 인사/복무 (10개) ══════
  {
    id: 1, name: '승진소요연수', cat: '인사',
    query: '공무원 승진 소요 최저연수가 어떻게 되나요',
    expectedCitations: ['국가공무원법', '승진'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 2, name: '전보제한', cat: '인사',
    query: '공무원 전보 제한 기간과 예외 사유',
    expectedCitations: ['공무원임용령', '전보'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 3, name: '직위해제', cat: '인사',
    query: '공무원 직위해제 사유와 법적 효과',
    expectedCitations: ['국가공무원법'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 4, name: '시보임용', cat: '인사',
    query: '공무원 시보임용 기간과 시보 면직 사유',
    expectedCitations: ['국가공무원법'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 5, name: '당직근무', cat: '인사',
    query: '공무원 당직근무 편성 기준과 수당',
    expectedCitations: ['복무', '당직'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 150,
  },
  {
    id: 6, name: '교육훈련', cat: '인사',
    query: '공무원 교육훈련 의무 시간과 종류',
    expectedCitations: ['공무원 인재개발법', '교육훈련'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 7, name: '병가', cat: '인사',
    query: '공무원 병가 일수 한도와 진단서 제출 기준',
    expectedCitations: ['복무규정', '병가'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 8, name: '육아시간', cat: '인사',
    query: '공무원 육아시간 사용 조건과 신청 방법',
    expectedCitations: ['복무규정', '육아'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 9, name: '명예퇴직', cat: '인사',
    query: '공무원 명예퇴직 요건과 명예퇴직수당 산정 기준',
    expectedCitations: ['국가공무원법', '명예퇴직'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 10, name: '파견근무', cat: '인사',
    query: '공무원 파견 근무의 종류와 파견 기간 제한',
    expectedCitations: ['공무원임용령', '파견'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 2. 급여/수당/연금 (7개) ══════
  {
    id: 11, name: '시간외수당', cat: '급여',
    query: '공무원 시간외근무수당 지급 기준과 한도',
    expectedCitations: ['공무원수당', '시간외'],
    expectedDomainTools: ['search_ai_law', 'get_annexes'],
    minAnswerLen: 200,
  },
  {
    id: 12, name: '가족수당', cat: '급여',
    query: '공무원 가족수당 지급 대상과 금액',
    expectedCitations: ['공무원수당', '가족수당'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 150,
  },
  {
    id: 13, name: '정근수당', cat: '급여',
    query: '공무원 정근수당 지급률과 가산금 기준',
    expectedCitations: ['공무원수당', '정근수당'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 14, name: '직급보조비', cat: '급여',
    query: '공무원 직급보조비 지급 기준과 금액',
    expectedCitations: ['공무원수당', '직급보조비'],
    expectedDomainTools: ['search_ai_law', 'get_annexes'],
    minAnswerLen: 150,
  },
  {
    id: 15, name: '명절휴가비', cat: '급여',
    query: '공무원 명절휴가비 지급 대상과 계산 방법',
    expectedCitations: ['공무원수당', '명절'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 150,
  },
  {
    id: 16, name: '순직유족급여', cat: '급여',
    query: '공무원 순직 유족급여 및 위험직무순직 인정 기준',
    expectedCitations: ['공무원연금법', '순직'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 17, name: '퇴직수당', cat: '급여',
    query: '공무원 퇴직수당 산정 방법과 지급 기준',
    expectedCitations: ['공무원연금법', '공무원수당', '퇴직'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 3. 민원/행정절차 (7개) ══════
  {
    id: 18, name: '행정예고', cat: '행정',
    query: '행정예고 절차와 예고 기간 기준',
    expectedCitations: ['행정절차법', '행정예고'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 19, name: '인허가의제', cat: '행정',
    query: '인허가 의제 처리 절차와 협의 기한',
    expectedCitations: ['행정기본법', '인허가', '의제'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 20, name: '행정대집행', cat: '행정',
    query: '행정대집행의 요건과 집행 절차',
    expectedCitations: ['행정대집행법', '대집행'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 21, name: '과태료부과', cat: '행정',
    query: '과태료 부과 절차와 이의제기 방법',
    expectedCitations: ['질서위반행위규제법', '과태료'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 22, name: '행정심판', cat: '행정',
    query: '행정심판 청구 기한과 심판 유형',
    expectedCitations: ['행정심판법'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 200,
  },
  {
    id: 23, name: '개인정보파기', cat: '행정',
    query: '공공기관 개인정보 파기 의무와 방법',
    expectedCitations: ['개인정보', '파기'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 24, name: '위원회운영', cat: '행정',
    query: '지방자치단체 위원회 설치 기준과 운영 규정',
    expectedCitations: ['지방자치법', '위원회'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 4. 청렴/윤리 (5개) ══════
  {
    id: 25, name: '이해충돌신고', cat: '청렴',
    query: '이해충돌방지법 사적이해관계 신고 의무와 절차',
    expectedCitations: ['이해충돌', '공직자'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 26, name: '재산등록', cat: '청렴',
    query: '공직자 재산등록 대상 범위와 등록 재산 종류',
    expectedCitations: ['공직자윤리법', '재산등록'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 27, name: '선물신고', cat: '청렴',
    query: '공직자가 받을 수 있는 선물 한도 금액',
    expectedCitations: ['청탁금지법', '공직자'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 150,
  },
  {
    id: 28, name: '퇴직자취업제한', cat: '청렴',
    query: '퇴직 공무원 취업 제한 기간과 대상 기관 범위',
    expectedCitations: ['공직자윤리법', '취업제한'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 29, name: '공익신고', cat: '청렴',
    query: '공익신고자 보호 제도와 보상금 지급 기준',
    expectedCitations: ['공익신고자보호법', '공익신고'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 5. 계약/조달/보조금 (5개) ══════
  {
    id: 30, name: '수의계약', cat: '계약',
    query: '지방계약 수의계약 가능 금액 한도와 사유',
    expectedCitations: ['지방계약법', '수의계약'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 31, name: '입찰자격심사', cat: '계약',
    query: '지방자치단체 입찰 참가자격 사전심사 기준',
    expectedCitations: ['지방계약법', '입찰'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 32, name: '보조금정산', cat: '계약',
    query: '지방보조금 정산 절차와 정산 기한',
    expectedCitations: ['보조금', '정산'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 33, name: '하자보수', cat: '계약',
    query: '공사 계약 하자보수보증금 비율과 하자담보기간',
    expectedCitations: ['계약', '하자'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 34, name: '물품관리', cat: '계약',
    query: '지방자치단체 물품관리 기준과 불용결정 절차',
    expectedCitations: ['물품관리법', '물품'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 6. 지방자치/조례 (5개) ══════
  {
    id: 35, name: '주민참여예산', cat: '자치',
    query: '주민참여예산제도 운영 절차와 주민 의견 수렴 방법',
    expectedCitations: ['지방재정법', '주민참여예산'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 36, name: '주민감사청구', cat: '자치',
    query: '주민감사청구 요건과 처리 절차',
    expectedCitations: ['지방자치법', '주민감사'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 37, name: '조례제개정', cat: '자치',
    query: '지방자치단체 조례 제정 및 개정 절차',
    expectedCitations: ['지방자치법', '조례'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 38, name: '행정사무감사', cat: '자치',
    query: '지방의회 행정사무감사 범위와 증인 출석 요구',
    expectedCitations: ['지방자치법', '감사'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 39, name: '주민자치회', cat: '자치',
    query: '읍면동 주민자치회 구성 방법과 역할',
    expectedCitations: ['지방자치분권', '주민자치'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 7. 세무/재정 (5개) ══════
  {
    id: 40, name: '체납처분', cat: '세무',
    query: '지방세 체납처분 절차와 압류 기준',
    expectedCitations: ['지방세징수법', '체납'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 41, name: '지방교부세', cat: '세무',
    query: '보통교부세 산정 기준과 교부 방법',
    expectedCitations: ['지방교부세법', '교부세'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 42, name: '세외수입', cat: '세무',
    query: '지방자치단체 세외수입 징수 절차와 결손처분',
    expectedCitations: ['세외수입', '징수', '결손'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 43, name: '재정건전성', cat: '세무',
    query: '지방재정 건전성 관리 기준과 재정위기단체 지정 요건',
    expectedCitations: ['지방재정법', '재정'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 44, name: '취득세감면', cat: '세무',
    query: '취득세 감면 대상과 추징 사유',
    expectedCitations: ['지방세특례제한법', '취득세', '감면'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 8. 건설/환경/안전 (6개) ══════
  {
    id: 45, name: '건축허가', cat: '건설',
    query: '건축허가 신청 절차와 필요 서류',
    expectedCitations: ['건축법', '건축허가'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 46, name: '환경영향평가', cat: '건설',
    query: '소규모 환경영향평가 대상 사업과 평가 절차',
    expectedCitations: ['환경영향평가법'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 47, name: '도로점용', cat: '건설',
    query: '도로점용허가 기준과 점용료 산정 방법',
    expectedCitations: ['도로법', '점용'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 48, name: '공유재산대부', cat: '건설',
    query: '공유재산 대부 절차와 대부료 산정 기준',
    expectedCitations: ['공유재산', '대부'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 49, name: '재난안전', cat: '건설',
    query: '지방자치단체 재난안전대책 수립 의무와 안전점검 기준',
    expectedCitations: ['재난', '안전'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },
  {
    id: 50, name: '소방시설', cat: '건설',
    query: '소방시설 설치 기준과 자체점검 의무',
    expectedCitations: ['소방시설', '소방'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 200,
  },

  // ══════ 9. 사내 변호사 자문 (10개) — 복합 분석/해석/분쟁 대비 ══════
  {
    id: 51, name: '파견도급구별', cat: '자문',
    query: '업무위탁 계약이 파견과 도급 중 어디에 해당하는지 판단 기준과 위반 시 제재',
    expectedCitations: ['파견', '도급', '근로'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 52, name: '부당징계구제', cat: '자문',
    query: '공무원 부당 징계에 대한 소청심사 청구 절차와 효력정지 가처분 가능 여부',
    expectedCitations: ['국가공무원법', '소청심사'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 53, name: '개인정보유출대응', cat: '자문',
    query: '공공기관 개인정보 유출 사고 발생 시 신고 의무와 손해배상 책임 범위',
    expectedCitations: ['개인정보 보호법', '개인정보'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 54, name: '행정처분취소소송', cat: '자문',
    query: '영업정지 처분에 대한 취소소송 제기 요건과 집행정지 신청 방법',
    expectedCitations: ['행정소송법', '행정심판법'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 55, name: '하도급공정거래', cat: '자문',
    query: '하도급대금 부당감액과 기술자료 유용의 판단 기준 및 공정위 신고 절차',
    expectedCitations: ['하도급', '공정거래'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 56, name: '국가배상청구', cat: '자문',
    query: '공무원 직무상 불법행위로 인한 국가배상 청구 요건과 구상권 행사 기준',
    expectedCitations: ['국가배상법'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 57, name: '규제영향분석', cat: '자문',
    query: '새로운 규제를 신설할 때 규제영향분석서 작성 기준과 규제심사 절차',
    expectedCitations: ['행정규제기본법', '규제'],
    expectedDomainTools: ['search_ai_law'],
    minAnswerLen: 300,
  },
  {
    id: 58, name: '공무원범죄통보', cat: '자문',
    query: '공무원 범죄 발견 시 수사기관 통보 의무와 직위해제·징계 병행 가능 여부',
    expectedCitations: ['국가공무원법', '형사소송법'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 59, name: '주민소송', cat: '자문',
    query: '지방재정 위법 지출에 대한 주민소송 4가지 유형과 제기 요건',
    expectedCitations: ['지방자치법', '주민소송'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
  },
  {
    id: 60, name: '계약분쟁조정', cat: '자문',
    query: '지방자치단체 공사계약 분쟁 시 하자담보책임 범위와 조정 절차 비교',
    expectedCitations: ['지방계약법', '국가계약법', '하자'],
    expectedDomainTools: ['search_ai_law', 'search_decisions'],
    minAnswerLen: 300,
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

function gradeResult(r, s) {
  const answerText = r.answer?.answer || ''
  const hasCitations = s.expectedCitations.some(c => answerText.includes(c))
  const longEnough = answerText.length >= s.minAnswerLen
  const confidence = r.answer?.confidenceLevel || 'none'
  const toolSet = new Set(r.tools)
  const domainToolHit = s.expectedDomainTools.some(t => toolSet.has(t))
  const verifyRate = r.citationVerification
    ? `${r.citationVerification.filter(c => c.verified).length}/${r.citationVerification.length}`
    : '-'

  const grade = (!r.answer || answerText.length < 50) ? 'F'
    : (!hasCitations && !longEnough) ? 'D'
    : (!hasCitations || !longEnough) ? 'C'
    : confidence === 'high' ? 'A'
    : confidence === 'medium' ? 'B'
    : 'C'

  return {
    hasCitations, longEnough, confidence, domainToolHit, verifyRate,
    answerLen: answerText.length, toolCount: r.tools.length, grade,
  }
}

// ─── 시나리오 실행 ───

async function runScenario(s) {
  const r = {
    id: s.id, name: s.name, cat: s.cat, query: s.query,
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
  r.quality = gradeResult(r, s)
  return r
}

// ─── 배치 실행 ───

async function runBatch(batch) {
  if (isParallel) {
    return Promise.all(batch.map(s => runScenario(s)))
  }
  const results = []
  for (const s of batch) results.push(await runScenario(s))
  return results
}

// ─── 결과 출력 ───

function printResult(r) {
  const g = r.quality
  const icon = g.grade === 'A' ? '🟢'
    : g.grade === 'B' ? '🟡'
    : g.grade === 'C' ? '🟠'
    : '🔴'
  const src = r.source === 'claude' ? 'C' : r.source === 'gemini' ? 'G' : r.source === 'openclaw' ? 'B' : '?'
  console.log(`${icon} [${String(r.id).padStart(2)}] ${r.cat}/${r.name} (${fmt(r.durationMs)}) — ${g.grade} [${src}]`)
  console.log(`   ${g.answerLen}ch | Cite:${g.hasCitations ? '✅' : '❌'} | Tools:${g.toolCount} | DomainTool:${g.domainToolHit ? '✅' : '❌'} | Conf:${g.confidence} | Verify:${g.verifyRate}`)
  if (r.errors.length) console.log(`   ⚠️ ${r.errors[0].slice(0, 140)}`)
}

function printCategorySummary(results) {
  const cats = [...new Set(results.map(r => r.cat))]
  console.log('\n── 카테고리별 요약 ──')
  console.log('카테고리  | 개수 |  A  |  B  |  C  | D/F | 평균시간 | Pass%')
  console.log('─'.repeat(68))
  for (const cat of cats) {
    const catResults = results.filter(r => r.cat === cat)
    const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const r of catResults) grades[r.quality.grade]++
    const avgMs = catResults.reduce((s, r) => s + r.durationMs, 0) / catResults.length
    const passRate = ((grades.A + grades.B) / catResults.length * 100).toFixed(0)
    console.log(
      `${cat.padEnd(6)}    | ${String(catResults.length).padStart(3)}  | ${String(grades.A).padStart(3)} | ${String(grades.B).padStart(3)} | ${String(grades.C).padStart(3)} | ${String(grades.D + grades.F).padStart(3)} | ${fmt(avgMs).padStart(7)}  | ${passRate}%`
    )
  }
}

function printFailureDetails(results) {
  const failures = results.filter(r => r.quality.grade === 'F' || r.quality.grade === 'D')
  if (failures.length === 0) return
  console.log('\n── 실패 케이스 상세 ──')
  for (const r of failures) {
    console.log(`\n🔴 [${r.id}] ${r.cat}/${r.name}`)
    console.log(`   질문: ${r.query}`)
    console.log(`   도구: ${r.tools.join(', ') || 'none'}`)
    console.log(`   답변길이: ${r.quality.answerLen}ch`)
    if (r.answer?.answer) console.log(`   답변(첫100자): ${r.answer.answer.slice(0, 100)}...`)
    if (r.errors.length) console.log(`   에러: ${r.errors.join('; ')}`)
  }
}

// ─── 이전 결과 로드 (재실행 시 비교) ───

function loadPreviousResults() {
  try {
    if (existsSync(RESULTS_FILE)) {
      return JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'))
    }
  } catch {}
  return null
}

function printComparison(current, previous) {
  if (!previous) return
  console.log('\n── 이전 실행 대비 변화 ──')
  let improved = 0, regressed = 0, unchanged = 0
  const gradeOrder = { A: 4, B: 3, C: 2, D: 1, F: 0 }
  for (const r of current) {
    const prev = previous.find(p => p.id === r.id)
    if (!prev?.grade) continue
    const diff = gradeOrder[r.quality.grade] - gradeOrder[prev.grade]
    if (diff > 0) {
      improved++
      console.log(`  ⬆️ [${r.id}] ${r.name}: ${prev.grade} → ${r.quality.grade}`)
    } else if (diff < 0) {
      regressed++
      console.log(`  ⬇️ [${r.id}] ${r.name}: ${prev.grade} → ${r.quality.grade}`)
    } else {
      unchanged++
    }
  }
  console.log(`  개선: ${improved} | 퇴보: ${regressed} | 유지: ${unchanged}`)
}

// ─── 메인 ───

async function main() {
  let active = scenarios

  // 필터링
  if (pickIds) active = active.filter(s => pickIds.includes(s.id))
  if (catFilter) active = active.filter(s => s.cat.includes(catFilter))

  // --failures-only: 이전 F/D만 재실행
  if (failuresOnly) {
    const prev = loadPreviousResults()
    if (prev) {
      const failIds = prev.filter(r => r.quality.grade === 'F' || r.quality.grade === 'D').map(r => r.id)
      active = active.filter(s => failIds.includes(s.id))
      console.log(`이전 실패 ${failIds.length}건 재실행: [${failIds.join(',')}]`)
    }
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  공무원 실무 E2E 50 — ${active.length}개 (배치${BATCH_SIZE}, ${isParallel ? '병렬' : '순차'})`)
  console.log(`${'═'.repeat(60)}\n`)

  const totalStart = Date.now()
  const allResults = []

  // 배치 실행
  for (let i = 0; i < active.length; i += BATCH_SIZE) {
    const batch = active.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(active.length / BATCH_SIZE)
    console.log(`── 배치 ${batchNum}/${totalBatches} (${batch.map(s => s.id).join(',')}) ──`)

    const results = await runBatch(batch)
    for (const r of results) {
      printResult(r)
      allResults.push(r)
    }
    console.log()
  }

  // ── 종합 ──
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const r of allResults) grades[r.quality.grade]++
  const avgMs = allResults.reduce((s, r) => s + r.durationMs, 0) / allResults.length
  const wallMs = isParallel
    ? (() => {
        let total = 0
        for (let i = 0; i < allResults.length; i += BATCH_SIZE) {
          const batch = allResults.slice(i, i + BATCH_SIZE)
          total += Math.max(...batch.map(r => r.durationMs))
        }
        return total
      })()
    : allResults.reduce((s, r) => s + r.durationMs, 0)
  const domainToolOK = allResults.filter(r => r.quality.domainToolHit).length
  const citeOK = allResults.filter(r => r.quality.hasCitations).length

  printCategorySummary(allResults)
  printFailureDetails(allResults)

  // 이전 결과 비교
  const previousResults = loadPreviousResults()
  printComparison(allResults, previousResults)

  console.log('\n' + '═'.repeat(60))
  console.log('  SUMMARY')
  console.log('═'.repeat(60))
  console.log(`  Grade  A:${grades.A}  B:${grades.B}  C:${grades.C}  D:${grades.D}  F:${grades.F}`)
  console.log(`  Pass (A+B): ${grades.A + grades.B}/${allResults.length} (${((grades.A + grades.B) / allResults.length * 100).toFixed(0)}%)`)
  console.log(`  Citation Match: ${citeOK}/${allResults.length}`)
  console.log(`  Domain Tool Hit: ${domainToolOK}/${allResults.length}`)
  console.log(`  Avg Response: ${fmt(avgMs)} | Wall Time: ${fmt(wallMs)} | Total: ${fmt(Date.now() - totalStart)}`)
  console.log(`  Overall: ${(grades.A + grades.B) >= allResults.length * 0.7 ? '✅ PASS (≥70%)' : '❌ NEEDS WORK (<70%)'}`)
  console.log('═'.repeat(60))

  // 결과 저장
  if (saveResults) {
    const saveData = allResults.map(r => ({
      id: r.id, name: r.name, cat: r.cat,
      grade: r.quality.grade, confidence: r.quality.confidence,
      answerLen: r.quality.answerLen, toolCount: r.quality.toolCount,
      hasCitations: r.quality.hasCitations, domainToolHit: r.quality.domainToolHit,
      durationMs: r.durationMs, source: r.source,
      tools: r.tools, errors: r.errors,
    }))
    writeFileSync(RESULTS_FILE, JSON.stringify(saveData, null, 2))
    console.log(`\n결과 저장: ${RESULTS_FILE}`)
  }
}

main().catch(console.error)
