/**
 * article-suggestions.ts — 조문 기반 추천 질의 생성기
 *
 * 조문 텍스트에서 법령 용어 패턴을 감지하여
 * 사용자가 궁금해할 만한 질의를 자동 생성.
 *
 * 9개 카테고리:
 *   delegation  — 위임 규정 (시행령/시행규칙/고시)
 *   penalty     — 벌칙/제재 (징역/벌금/과태료/취소)
 *   annex       — 별표/서식 (별표/별지/기준표)
 *   procedure   — 절차/의무 (신청/신고/등록/허가)
 *   deadline    — 기한/기간 (N일 이내/즉시/유효기간)
 *   exemption   — 면제/예외 (면제/감면/특례/적용제외)
 *   amount      — 금액/수치 (N원/N%/산정/가산)
 *   definition  — 정의 규정 (이란/말한다/용어의 뜻)
 *   reference   — 다른 법 참조 (「OO법」/준용)
 */

export interface ArticleSuggestion {
  /** 칩에 표시할 짧은 라벨 */
  label: string
  /** FC-RAG에 보낼 전체 질의 (AI 타입만) */
  query?: string
  /** 'ai' = FC-RAG 경유, 'law' = 기존 법령 API 직접 호출 */
  type: 'ai' | 'law'
  /** law 타입일 때 실행할 액션 */
  action?: 'three_tier' | 'annexes' | 'precedents' | 'history' | 'related'
  /** 정렬 우선순위 (낮을수록 먼저) */
  priority: number
}

// ─── 패턴 정의 ─────────────────────────────────────────────────────────────

const PATTERNS = {
  delegation: /대통령령(?:으로|에서)?\s*정하|(?:총리|부)령(?:으로|에서)?\s*정하|시행령|시행규칙|고시(?:로|로써)\s*정하|훈령(?:으로|에서)\s*정하|(?:에서|으로)\s*정하는\s*바에/,

  penalty: /\d+년?\s*이하의?\s*징역|\d+(?:만|천|백|억)?\s*원\s*이하의?\s*벌금|과태료(?:를|에)\s*부과|위반한?\s*(?:자|경우|때)|처벌|영업(?:의?\s*)?(?:정지|취소|폐쇄)|허가(?:의?\s*)?취소|과징금|자격(?:의?\s*)?(?:정지|취소)|등록(?:의?\s*)?취소|인가(?:의?\s*)?취소|시정명령|시정조치|하여서는\s*(?:아니|안)\s*된다/,

  annex: /별표\s*(?:제?\s*\d+\s*(?:호|번)?)?|\[별표\s*\d+\]|별지\s*(?:제?\s*\d+\s*호?\s*)?(?:서식)?|(?:급여|수당|세율|과태료|감면|가산)\s*(?:표|기준표)|부표/,

  procedure: /(?:신청|신고|등록|보고|제출|통보|통지)(?:하여야|해야)\s*(?:한다)?|허가를\s*받아야|인가를\s*받아야|승인(?:을\s*)?받아야|신청서|구비서류|첨부서류|처리기간|처리절차/,

  deadline: /\d+일\s*이내|\d+개월\s*이내|\d+년\s*이내|지체\s*없이|즉시|사전에|기한\s*내|갱신|연장|유효기간/,

  exemption: /적용하지\s*(?:아니한다|않는다)|면제(?:할\s*수\s*있다|한다|된다)|감면(?:할\s*수|한다)|예외(?:로\s*한다|로\s*할\s*수)|특례|적용\s*제외|제외(?:한다|할\s*수)|경감(?:할\s*수|한다)|감경|그러하지\s*(?:아니하다|않다)|다만\s*,/,

  amount: /\d+(?:만|천|백|억)?\s*원|\d+(?:\.\d+)?\s*(?:퍼센트|%)|분의\s*\d+|\d+배|(?:이상|이하|초과|미만)|산정|산출|가산|감산|할증|통상임금|평균임금|기준임금/,

  definition: /(?:이\s*법|이\s*영|이\s*규칙)에서\s*(?:사용하는|쓰는)\s*용어|"[^"]*"\s*(?:이란|란|라\s*함은)|말한다|뜻한다/,

  reference: /「[^」]+」|준용한다|준용된다/,
} as const

type PatternKey = keyof typeof PATTERNS

// ─── 카테고리별 추천 질의 매핑 ─────────────────────────────────────────────

interface SuggestionTemplate {
  label: string
  type: 'ai' | 'law'
  action?: ArticleSuggestion['action']
  priority: number
  /** AI 질의 생성 함수. lawName, articleNo를 받아 query 문자열 반환 */
  buildQuery?: (lawName: string, articleNo: string) => string
}

const CATEGORY_SUGGESTIONS: Record<PatternKey, SuggestionTemplate> = {
  delegation: {
    label: '시행령/시행규칙 보기',
    type: 'law',
    action: 'three_tier',
    priority: 1,
  },
  annex: {
    label: '별표 보기',
    type: 'law',
    action: 'annexes',
    priority: 1,
  },
  penalty: {
    label: '위반 시 처벌은?',
    type: 'ai',
    priority: 2,
    buildQuery: (law, art) => `「${law}」 ${art} 위반 시 벌칙과 과태료, 구제 방법을 알려줘`,
  },
  procedure: {
    label: '신청 절차/서류는?',
    type: 'ai',
    priority: 2,
    buildQuery: (law, art) => `「${law}」 ${art}에 따른 신청 절차와 필요 서류를 단계별로 정리해줘`,
  },
  exemption: {
    label: '면제/감면 조건은?',
    type: 'ai',
    priority: 3,
    buildQuery: (law, art) => `「${law}」 ${art}의 면제·감면·예외 조건과 신청 방법을 알려줘`,
  },
  amount: {
    label: '계산 예시',
    type: 'ai',
    priority: 3,
    buildQuery: (law, art) => `「${law}」 ${art}의 금액·비율 기준을 실제 사례로 계산해줘`,
  },
  deadline: {
    label: '기한 정리',
    type: 'ai',
    priority: 3,
    buildQuery: (law, art) => `「${law}」 ${art}에 나오는 기한·기간을 기산점부터 만료일까지 정리해줘`,
  },
  definition: {
    label: '용어 풀이',
    type: 'ai',
    priority: 4,
    buildQuery: (law, art) => `「${law}」 ${art}에서 정의하는 용어들을 쉽게 풀어서 설명해줘`,
  },
  reference: {
    label: '참조 법령 보기',
    type: 'law',
    action: 'related',
    priority: 4,
  },
}

// ─── 메인 함수 ──────────────────────────────────────────────────────────────

/**
 * 조문 텍스트를 분석하여 추천 질의 목록 생성.
 *
 * @param articleText  조문 본문 (HTML 태그 제거된 순수 텍스트)
 * @param lawName      법령명 (예: "근로기준법")
 * @param articleNo    조문번호 (예: "제56조")
 * @returns 최대 5개 추천 질의 (우선순위순, "쉽게 설명" 항상 첫 번째)
 */
export function generateSuggestions(
  articleText: string,
  lawName: string,
  articleNo: string,
): ArticleSuggestion[] {
  const text = stripHtml(articleText)

  // ── 패턴 매칭: 감지된 카테고리 수집 ──
  const detected: ArticleSuggestion[] = []

  for (const [key, regex] of Object.entries(PATTERNS) as [PatternKey, RegExp][]) {
    if (regex.test(text)) {
      const tmpl = CATEGORY_SUGGESTIONS[key]
      detected.push({
        label: tmpl.label,
        type: tmpl.type,
        action: tmpl.action,
        priority: tmpl.priority,
        query: tmpl.buildQuery?.(lawName, articleNo),
      })
    }
  }

  // ── 우선순위 정렬 + 중복 타입 제한 ──
  detected.sort((a, b) => a.priority - b.priority)

  // AI 최대 3개, 법령 최대 2개
  const result: ArticleSuggestion[] = []
  let aiCount = 0
  let lawCount = 0

  for (const s of detected) {
    if (s.type === 'ai' && aiCount >= 3) continue
    if (s.type === 'law' && lawCount >= 2) continue
    result.push(s)
    if (s.type === 'ai') aiCount++
    else lawCount++
    if (result.length >= 4) break // 기본 "쉽게 설명" 자리 확보
  }

  // ── "쉽게 설명해줘" 항상 첫 번째 ──
  const explain: ArticleSuggestion = {
    label: '쉽게 설명해줘',
    type: 'ai',
    priority: 0,
    query: `「${lawName}」 ${articleNo}를 법률 비전문가도 이해할 수 있게 쉽게 설명해줘`,
  }

  return [explain, ...result].slice(0, 5)
}

// ─── 유틸 ───────────────────────────────────────────────────────────────────

/** HTML 태그 제거 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
