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

const LAW_ALIAS_ENTRIES: LawAliasEntry[] = [
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
]

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
