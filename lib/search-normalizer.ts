import { debugLogger } from "./debug-logger"

interface LawAliasEntry {
  canonical: string
  aliases: string[]
  alternatives?: string[]
}

export interface LawAliasResolution {
  canonical: string
  matchedAlias?: string
  alternatives: string[]
}

const BASIC_CHAR_MAP = new Map<string, string>([
  // 법 오타
  ["벚", "법"],
  ["벆", "법"],
  ["벋", "법"],
  ["뻡", "법"],
  ["볍", "법"],
  ["뱝", "법"],
  // 세 오타
  ["셰", "세"],
  ["쉐", "세"],
  // 관 오타
  ["괸", "관"],
  ["곽", "관"],
  // 업 오타
  ["엄", "업"],
  ["얼", "업"],
])

export const LAW_ALIAS_ENTRIES: LawAliasEntry[] = [
  {
    canonical: "대한민국헌법",
    aliases: ["헌법", "헌 법"],
  },
  {
    canonical: "관세법",
    aliases: ["관세벚", "관세요", "관세 볍", "관세 볍률"],
  },
  {
    canonical: "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률",
    aliases: ["fta특례법", "fta 특례법", "fta 특례", "fta특례", "에프티에이특례법"],
    alternatives: ["관세법", "관세법 시행령", "관세법 시행규칙"],
  },
  {
    canonical: "화학물질관리법",
    aliases: ["화관법", "화관 법", "화학물질 관리법"],
    alternatives: ["화학물질관리법 시행령", "화학물질관리법 시행규칙"],
  },
  {
    canonical: "행정기본법",
    aliases: ["행정법", "행정 법"],
    alternatives: ["행정절차법", "행정조사기본법", "행정규제기본법"],
  },
  {
    canonical: "대외무역법",
    aliases: ["무역법", "원산지 사후판정", "원산지법"],
    alternatives: ["원산지표시법", "관세법"],
  },
  {
    canonical: "원산지표시법",
    aliases: ["원산지 표시법", "원산지표시"],
    alternatives: ["대외무역법", "관세법"],
  },
  // ── 다빈도 노무/안전 ──
  {
    canonical: "산업안전보건법",
    aliases: ["산안법"],
    alternatives: ["산업안전보건법 시행령", "산업안전보건법 시행규칙", "산업안전보건기준에 관한 규칙"],
  },
  {
    canonical: "산업안전보건기준에 관한 규칙",
    aliases: ["산안기준규칙", "안전보건규칙", "산업안전보건규칙", "산안규칙", "안전보건기준규칙"],
    alternatives: ["산업안전보건법", "산업안전보건법 시행령"],
  },
  {
    canonical: "중대재해 처벌 등에 관한 법률",
    aliases: ["중대재해처벌법", "중처법", "중대재해법"],
    alternatives: ["산업안전보건법"],
  },
  {
    canonical: "근로기준법",
    aliases: ["근기법", "근로법"],
  },
  {
    canonical: "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률",
    aliases: ["남녀고용평등법", "고평법"],
  },
  // ── 개인정보/정보통신 ──
  {
    canonical: "개인정보 보호법",
    aliases: ["개보법", "개인정보법", "개인정보보호법"],
  },
  {
    canonical: "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
    aliases: ["정보통신망법", "정통망법"],
  },
  // ── 청렴/이해충돌 ──
  {
    canonical: "부정청탁 및 금품등 수수의 금지에 관한 법률",
    aliases: ["청탁금지법", "김영란법"],
  },
  {
    canonical: "공직자의 이해충돌 방지법",
    aliases: ["이해충돌방지법", "공직자이해충돌방지법"],
  },
  // ── 공공계약/공공기관 ──
  {
    canonical: "국가를 당사자로 하는 계약에 관한 법률",
    aliases: ["국가계약법"],
    alternatives: ["국가를 당사자로 하는 계약에 관한 법률 시행령"],
  },
  {
    canonical: "지방자치단체를 당사자로 하는 계약에 관한 법률",
    aliases: ["지방계약법"],
    alternatives: ["지방자치단체를 당사자로 하는 계약에 관한 법률 시행령"],
  },
  {
    canonical: "공공기관의 정보공개에 관한 법률",
    aliases: ["정보공개법"],
  },
  // ── 부동산/주택 ──
  {
    canonical: "부동산 거래신고 등에 관한 법률",
    aliases: ["부동산거래신고법", "부거법"],
  },
  {
    canonical: "주택임대차보호법",
    aliases: ["주임법"],
  },
  {
    canonical: "상가건물 임대차보호법",
    aliases: ["상임법", "상가임대차법"],
  },
  // ── 소방/건축 ──
  {
    canonical: "소방시설 설치 및 관리에 관한 법률",
    aliases: ["소방시설법"],
  },
  // ── 세법 ──
  {
    canonical: "국세기본법",
    aliases: ["국기법"],
  },
  {
    canonical: "부가가치세법",
    aliases: ["부가세법"],
  },
]

/**
 * 쿼리 내에 등록된 약칭이 포함되어 있는지 감지해 매핑을 반환.
 * FC-RAG 프롬프트에서 LLM 에게 "이 약칭은 정식 명칭으로 변환하라" 힌트를 주기 위해 사용.
 * 중복 entry 는 dedup. 매칭 없으면 빈 배열.
 */
export function detectAliasesInQuery(query: string): Array<{ alias: string; canonical: string }> {
  if (!query) return []
  const normalized = normalizeBasicTypos(query).toLowerCase().replace(/\s+/gu, "")
  const hits: Array<{ alias: string; canonical: string }> = []
  const seen = new Set<string>()
  for (const entry of LAW_ALIAS_ENTRIES) {
    for (const alias of entry.aliases) {
      const aliasKey = normalizeAliasKey(alias)
      // 너무 짧은 약칭(3자 미만)은 오탐 위험 → 스킵
      if (aliasKey.length < 3) continue
      if (normalized.includes(aliasKey) && !seen.has(entry.canonical)) {
        seen.add(entry.canonical)
        hits.push({ alias, canonical: entry.canonical })
        break
      }
    }
  }
  return hits
}

const aliasLookup = new Map<string, LawAliasEntry>()

for (const entry of LAW_ALIAS_ENTRIES) {
  aliasLookup.set(normalizeAliasKey(entry.canonical), entry)
  for (const alias of entry.aliases) {
    aliasLookup.set(normalizeAliasKey(alias), entry)
  }
}

function normalizeAliasKey(value: string): string {
  return normalizeBasicTypos(value)
    .toLowerCase()
    .replace(/\s+/gu, "")
    .replace(/[·•]/gu, "")
}

function normalizeBasicTypos(value: string): string {
  return value.replace(/[벚벆벋뻡볍뱝셰쉐괸곽엄얼]/gu, (char) => BASIC_CHAR_MAP.get(char) ?? char)
}

export function normalizeLawSearchText(input: string): string {
  let value = input.normalize("NFC")

  value = value
    .replace(/[\u00a0\u2002\u2003\u2009]/gu, " ")
    .replace(/[‐‑‒–—―﹘﹣－]/gu, "-")
    .replace(/[﹦=]/gu, " ")
    .replace(/§/gu, " 제")
    .replace(/\s*[-]\s*/gu, "-")
    .replace(/\s*\.\s*/gu, " ")

  value = normalizeBasicTypos(value)

  // 영문+한글 붙어있는 경우 띄어쓰기 추가 (예: "fta특별법" → "fta 특별법")
  // 법제처 API가 붙어있으면 정확히 일치하는 것만 찾음
  value = value.replace(/([a-zA-Z])([가-힣])/gu, "$1 $2")

  value = value
    .replace(/\s+/gu, " ")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")")
    .trim()

  debugLogger.debug("검색어 정규화", { input, normalized: value })

  return value
}

export function resolveLawAlias(lawName: string): LawAliasResolution {
  const normalizedKey = normalizeAliasKey(lawName)
  const entry = aliasLookup.get(normalizedKey)

  if (entry) {
    const matchedAlias = entry.aliases.find((alias) => normalizeAliasKey(alias) === normalizedKey)
    debugLogger.debug("법령 약칭 매핑", { input: lawName, canonical: entry.canonical, matchedAlias })
    return {
      canonical: entry.canonical,
      matchedAlias: matchedAlias || undefined,
      alternatives: entry.alternatives ?? [],
    }
  }

  const cleaned = normalizeBasicTypos(lawName).trim()
  return {
    canonical: cleaned,
    alternatives: [],
  }
}

/**
 * Phase 7: 조문 번호를 표준 형식으로 정규화
 * "38조" → "제38조"
 * "10조의2" → "제10조의2"
 * "제38조" → "제38조" (이미 정규화됨)
 */
function normalizeArticleNumber(text: string): string {
  // "숫자+조" 패턴을 "제+숫자+조"로 변환 (이미 "제"가 없는 경우만)
  return text.replace(/(\s)(\d+조(?:의\d+)?)/g, '$1제$2')
}

// 전체 검색 쿼리 정규화 (Phase 2: 학습 시스템용, Phase 7: 조문 번호 정규화 추가)
export function normalizeSearchQuery(query: string): string {
  let normalized = normalizeLawSearchText(query)

  // 법령명 약칭 해결
  const parsed = require('./law-parser').parseSearchQuery(normalized)
  if (parsed.lawName) {
    const resolved = resolveLawAlias(parsed.lawName)
    normalized = normalized.replace(parsed.lawName, resolved.canonical)
  }

  // Phase 7: 조문 번호 정규화 (searchKey 통일을 위해)
  normalized = normalizeArticleNumber(normalized)

  return normalized
}

/**
 * 유사어 그룹 정의
 * 검색어에 포함된 단어를 유사어로 확장
 */
const SYNONYM_GROUPS: string[][] = [
  ["특별법", "특례법", "특례"],
  ["시행령", "시행규칙", "규칙"],
  ["기본법", "기본"],
]

export interface SynonymExpansion {
  original: string           // 원본 검색어
  expanded: string[]         // 확장된 검색어들
  matchedSynonym?: string    // 매칭된 유사어 (없으면 undefined)
}

/**
 * 검색어에서 유사어를 찾아 확장된 검색어 목록 반환
 * 예: "fta 특별법" → ["fta 특례법", "fta 특례"]
 */
export function expandSearchSynonyms(query: string): SynonymExpansion {
  const normalizedQuery = normalizeLawSearchText(query).toLowerCase()
  const result: SynonymExpansion = {
    original: query,
    expanded: [],
  }

  for (const group of SYNONYM_GROUPS) {
    for (const synonym of group) {
      if (normalizedQuery.includes(synonym)) {
        result.matchedSynonym = synonym
        // 해당 그룹의 다른 유사어로 치환한 검색어 생성
        for (const altSynonym of group) {
          if (altSynonym !== synonym) {
            const expanded = normalizedQuery.replace(synonym, altSynonym)
            result.expanded.push(expanded)
          }
        }
        debugLogger.debug("유사어 확장", { query, synonym, expanded: result.expanded })
        return result
      }
    }
  }

  return result
}
