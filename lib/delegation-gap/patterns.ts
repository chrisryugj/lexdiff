import type { DelegationTargetType } from "./types"

/**
 * 위임 대상 유형별 패턴
 * 각 패턴은 global flag 없이 정의 — matchAll 시 new RegExp로 생성
 */
const DELEGATION_PATTERN_SOURCES: Record<DelegationTargetType, string[]> = {
  시행령: [
    '대통령령(?:으로|에서|이)\\s*정',
    '대통령령에\\s*위임',
    '대통령령으로\\s*(?:정하는|정할\\s*수)',
  ],
  시행규칙: [
    '(?:총리령|부령)(?:으로|에서|이)\\s*정',
    '(?:국토교통부령|보건복지부령|환경부령|교육부령|법무부령|기획재정부령|행정안전부령|산업통상자원부령|고용노동부령|농림축산식품부령|해양수산부령|문화체육관광부령|여성가족부령|국방부령|통일부령|외교부령|과학기술정보통신부령)(?:으로|에서|이)\\s*정',
  ],
  고시등: [
    '(?:고시|훈령|예규|공고)(?:로|하여)\\s*정',
  ],
}

/** 위임이 아닌 false positive 패턴 (제외) */
const EXCLUSION_SOURCES = [
  '다른\\s*법률에서\\s*정',
  '조례로\\s*정',
  '이\\s*법에서\\s*정',
  '법률로\\s*정',
  '따로\\s*법률로',
]

/** 컴파일된 패턴 캐시 */
let compiledPatterns: { type: DelegationTargetType; regex: RegExp }[] | null = null
let compiledExclusions: RegExp[] | null = null

function getPatterns() {
  if (!compiledPatterns) {
    compiledPatterns = []
    for (const [type, sources] of Object.entries(DELEGATION_PATTERN_SOURCES)) {
      for (const src of sources) {
        compiledPatterns.push({
          type: type as DelegationTargetType,
          regex: new RegExp(src, 'g'),
        })
      }
    }
  }
  return compiledPatterns
}

function getExclusions() {
  if (!compiledExclusions) {
    compiledExclusions = EXCLUSION_SOURCES.map(src => new RegExp(src))
  }
  return compiledExclusions
}

/** 항번호 추출 ("①", "②" 등) */
const PARAGRAPH_REGEX = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/

/** 문장 단위로 분리 (마침표 기준) */
function splitSentences(text: string): string[] {
  // "~한다." "~된다." 등으로 끝나는 문장 기준 분리
  return text.split(/(?<=다\.)\s+/).filter(Boolean)
}

export interface DelegationMatch {
  targetType: DelegationTargetType
  rawText: string         // 매칭된 문장
  paragraph?: string      // 항번호
  matchIndex: number       // 원문 내 위치
}

/**
 * 조문 본문에서 위임 패턴을 추출한다.
 * @param content 조문 본문 텍스트
 * @returns 매칭된 위임 문구 배열
 */
export function extractDelegationMatches(content: string): DelegationMatch[] {
  if (!content) return []

  const patterns = getPatterns()
  const exclusions = getExclusions()
  const sentences = splitSentences(content)
  const matches: DelegationMatch[] = []
  const seen = new Set<string>()

  for (const sentence of sentences) {
    // 제외 패턴 체크
    if (exclusions.some(ex => ex.test(sentence))) continue

    for (const { type, regex } of patterns) {
      // 매번 lastIndex 리셋
      const re = new RegExp(regex.source, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(sentence)) !== null) {
        // 중복 방지 (같은 문장 + 같은 타입)
        const key = `${type}:${sentence.slice(0, 40)}`
        if (seen.has(key)) continue
        seen.add(key)

        // 항번호 추출
        const paraMatch = sentence.match(PARAGRAPH_REGEX)

        matches.push({
          targetType: type,
          rawText: sentence.trim(),
          paragraph: paraMatch?.[0],
          matchIndex: m.index,
        })
      }
    }
  }

  return matches
}
