/**
 * Decision Domain Registry — unified-decisions 도구의 도메인 단일 진실 소스
 *
 * `search_decisions` / `get_decision_text` 는 17개 도메인(판례/해석례/헌재/행정심판 등)을
 * 단일 도구로 통합한다. 이 파일은 도메인 메타데이터와 헬퍼를 제공하여
 * fc-rag 파이프라인 전반(result-utils, tool-cache, citations, gemini-engine,
 * fast-path, prompts, quality-evaluator, tool-tiers)에서 도구명 문자열 하드코딩을 제거한다.
 *
 * 규칙:
 *  - 도구 이름 리터럴 비교 금지 → isDecisionSearchTool / isDecisionGetTool / isDecisionTool
 *  - 결과/인자에서 도메인 추출 → extractDomain / getResultDomain
 *  - TTL/사이즈 한도 조회 → getDomainTTL / getDomainSizeLimit
 *  - 프롬프트 도메인 가이드 생성 → buildDomainPromptSection
 */

import type { ToolCallResult } from './tool-adapter'

// ─── 도메인 정의 ───

export const DECISION_DOMAINS = [
  'precedent',       // 판례
  'interpretation',  // 해석례 (법령해석)
  'tax_tribunal',    // 조세심판원 재결례
  'customs',         // 관세청 법령해석
  'constitutional',  // 헌법재판소 결정례
  'admin_appeal',    // 행정심판례
  'ftc',             // 공정거래위원회 결정문
  'pipc',            // 개인정보보호위원회 결정문
  'nlrc',            // 노동위원회 결정문
  'acr',             // 국민권익위원회 결정문
  'appeal_review',   // 소청심사 재결례
  'acr_special',     // 권익위 특별행정심판
  'school',          // 학칙
  'public_corp',     // 공사공단 규정
  'public_inst',     // 공공기관 규정
  'treaty',          // 조약
  'english_law',     // 영문법령
] as const

export type DecisionDomain = typeof DECISION_DOMAINS[number]

const DOMAIN_SET = new Set<string>(DECISION_DOMAINS)

// ─── 도메인 메타데이터 ───

export interface DomainMeta {
  /** 한국어 라벨 (UI/로그/프롬프트) */
  label: string
  /** 결과 요약에 쓰는 짧은 단어 (예: citations 문구 "판례 검색: ...") */
  shortLabel: string
  /** search_decisions 결과 TTL (ms) */
  searchTTL: number
  /** get_decision_text 결과 TTL (ms) */
  textTTL: number
  /** search_decisions 결과 길이 한도 (chars) */
  searchSizeLimit: number
  /** get_decision_text 결과 길이 한도 (chars) */
  textSizeLimit: number
  /** 프롬프트 도메인 가이드 한 줄 설명 */
  promptHint: string
  /** 주요 쿼리 도메인 여부 — 티어 선택/프롬프트 우선순위에 사용 */
  isPrimary: boolean
}

const HOUR = 3600_000
const DEFAULT_SEARCH_TTL = 12 * HOUR
const DEFAULT_TEXT_TTL = 24 * HOUR
const DEFAULT_SEARCH_LIMIT = 4000
const DEFAULT_TEXT_LIMIT = 6000

export const DOMAIN_META: Record<DecisionDomain, DomainMeta> = {
  precedent: {
    label: '판례', shortLabel: '판례',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: 8000,
    promptHint: '법원 판결문. 사실관계/쟁점/판단/결론 구조.',
    isPrimary: true,
  },
  interpretation: {
    label: '법령해석례', shortLabel: '해석례',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '법제처/소관부처 유권해석. 질의-회답 구조.',
    isPrimary: true,
  },
  tax_tribunal: {
    label: '조세심판원 재결례', shortLabel: '조세심판',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '조세 분쟁 재결례. 국세기본법/개별세법 쟁점.',
    isPrimary: true,
  },
  customs: {
    label: '관세청 법령해석', shortLabel: '관세해석',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '관세·수출입·FTA·HS코드 해석.',
    isPrimary: true,
  },
  constitutional: {
    label: '헌법재판소 결정례', shortLabel: '헌재',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '위헌·헌법소원·권한쟁의. 기본권 쟁점.',
    isPrimary: true,
  },
  admin_appeal: {
    label: '행정심판례', shortLabel: '행정심판',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '중앙/시도 행정심판위 재결. 행정처분 불복.',
    isPrimary: true,
  },
  ftc: {
    label: '공정거래위원회 결정문', shortLabel: '공정위',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '공정거래·하도급·가맹·표시광고 의결.',
    isPrimary: true,
  },
  pipc: {
    label: '개인정보보호위원회 결정문', shortLabel: '개인정보위',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '개인정보 처분·의결례.',
    isPrimary: true,
  },
  nlrc: {
    label: '노동위원회 결정문', shortLabel: '노동위',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '부당해고·부당노동행위 판정.',
    isPrimary: true,
  },
  acr: {
    label: '국민권익위원회 결정문', shortLabel: '권익위',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '고충민원·청렴·부패방지 결정.',
    isPrimary: false,
  },
  appeal_review: {
    label: '소청심사 재결례', shortLabel: '소청',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '공무원 징계 소청심사위 재결.',
    isPrimary: false,
  },
  acr_special: {
    label: '권익위 특별행정심판', shortLabel: '특별심판',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '권익위 특별행정심판 재결.',
    isPrimary: false,
  },
  school: {
    label: '학칙', shortLabel: '학칙',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '대학 학칙·학사 규정.',
    isPrimary: false,
  },
  public_corp: {
    label: '공사공단 규정', shortLabel: '공사공단',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '공사·공단 내부규정.',
    isPrimary: false,
  },
  public_inst: {
    label: '공공기관 규정', shortLabel: '공공기관',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '공공기관 내부규정.',
    isPrimary: false,
  },
  treaty: {
    label: '조약', shortLabel: '조약',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '양자·다자 조약문.',
    isPrimary: false,
  },
  english_law: {
    label: '영문법령', shortLabel: '영문법령',
    searchTTL: DEFAULT_SEARCH_TTL, textTTL: DEFAULT_TEXT_TTL,
    searchSizeLimit: DEFAULT_SEARCH_LIMIT, textSizeLimit: DEFAULT_TEXT_LIMIT,
    promptHint: '한국법령 영문번역본.',
    isPrimary: false,
  },
}

// ─── 도구 이름 판별 ───

export const SEARCH_DECISIONS_TOOL = 'search_decisions'
export const GET_DECISION_TEXT_TOOL = 'get_decision_text'

export function isDecisionSearchTool(name: string): boolean {
  return name === SEARCH_DECISIONS_TOOL
}

export function isDecisionGetTool(name: string): boolean {
  return name === GET_DECISION_TEXT_TOOL
}

export function isDecisionTool(name: string): boolean {
  return name === SEARCH_DECISIONS_TOOL || name === GET_DECISION_TEXT_TOOL
}

// ─── 도메인 추출 ───

/** 도구 호출 인자에서 domain 추출 */
export function extractDomain(args: unknown): DecisionDomain | null {
  if (!args || typeof args !== 'object') return null
  const domain = (args as Record<string, unknown>).domain
  if (typeof domain === 'string' && DOMAIN_SET.has(domain)) {
    return domain as DecisionDomain
  }
  return null
}

/**
 * 도구 결과 객체에서 도메인 추출.
 * result.name === 'search_decisions' 이고 result.args?.domain 이 있으면 반환.
 * tool-adapter.ToolCallResult 는 args를 보존하지 않으므로, 호출자가 (result, args) 쌍을
 * 직접 다루는 경우에만 extractDomain(args) 사용 권장.
 */
export function getResultDomain(
  result: { name: string },
  args?: unknown,
): DecisionDomain | null {
  if (!isDecisionTool(result.name)) return null
  return extractDomain(args)
}

// ─── 결과 필터링 ───

export type DecisionKind = 'search' | 'get'

export interface DecisionToolCall {
  name: string
  args: Record<string, unknown>
  result?: ToolCallResult
}

/** tool-call 기록에서 특정 도메인+종류 항목만 걸러냄 */
export function filterByDomain(
  calls: DecisionToolCall[],
  domain: DecisionDomain,
  kind: DecisionKind,
): DecisionToolCall[] {
  const targetTool = kind === 'search' ? SEARCH_DECISIONS_TOOL : GET_DECISION_TEXT_TOOL
  return calls.filter(c => c.name === targetTool && extractDomain(c.args) === domain)
}

// ─── TTL / Size limit 조회 ───

/** 도구 이름 + 인자로부터 TTL 결정. unified-decisions 가 아니면 null 반환 (caller가 기존 테이블로 폴백) */
export function getDomainTTL(name: string, args: unknown): number | null {
  const domain = extractDomain(args)
  if (!domain) return null
  const meta = DOMAIN_META[domain]
  if (isDecisionSearchTool(name)) return meta.searchTTL
  if (isDecisionGetTool(name)) return meta.textTTL
  return null
}

/** 도구 이름 + 인자로부터 결과 길이 한도 결정 */
export function getDomainSizeLimit(name: string, args: unknown): number | null {
  const domain = extractDomain(args)
  if (!domain) return null
  const meta = DOMAIN_META[domain]
  if (isDecisionSearchTool(name)) return meta.searchSizeLimit
  if (isDecisionGetTool(name)) return meta.textSizeLimit
  return null
}

// ─── 프롬프트 섹션 생성 ───

/**
 * LLM 시스템 프롬프트에 삽입할 도메인 가이드 블록 생성.
 * search_decisions / get_decision_text 사용법 + 17개 도메인 설명.
 */
export function buildDomainPromptSection(): string {
  const lines: string[] = []
  lines.push('## 통합 결정문 검색 (search_decisions / get_decision_text)')
  lines.push('')
  lines.push('판례·해석례·재결례 등 17개 도메인은 `search_decisions` 단일 도구로 검색한다.')
  lines.push('반드시 `domain` 파라미터를 명시할 것. 본문 조회는 `get_decision_text` 사용.')
  lines.push('')
  lines.push('### 도메인 목록')
  for (const d of DECISION_DOMAINS) {
    const m = DOMAIN_META[d]
    const star = m.isPrimary ? '★ ' : '  '
    lines.push(`- ${star}\`${d}\` — ${m.label}: ${m.promptHint}`)
  }
  lines.push('')
  lines.push('### 사용 규칙')
  lines.push('1. 동일 domain에 대해 `search_decisions` 를 연속 호출하지 말 것 (쿼리 조정 외 중복 금지)')
  lines.push('2. `search_decisions` 결과에서 id 획득 후에만 `get_decision_text` 호출')
  lines.push('3. 여러 도메인이 필요하면 병렬로 `search_decisions` 호출 (domain만 다르게)')
  return lines.join('\n')
}
