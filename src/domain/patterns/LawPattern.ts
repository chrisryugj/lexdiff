/**
 * LawPattern - 법령 패턴 정의
 *
 * 법령명, 조문 번호 추출 패턴
 */

// 「」로 감싼 법령명 패턴
export const QUOTED_LAW_PATTERN = /「([^」]+)」/g

// 일반 법령명 패턴
export const LAW_NAME_PATTERN = /([가-힣a-zA-Z0-9·\s]{2,60}(?:법|령|규칙|조례|약관|지침|규정|협정)(?:\s*시행령|\s*시행규칙)?)/g

// 조문 패턴 (제N조 제N항 제N호)
export const ARTICLE_PATTERN = /제\s*(\d+)\s*조(?:의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?/g

// 간단한 조문 패턴 ("38조" 형태)
export const SIMPLE_ARTICLE_PATTERN = /(?<!제)(?<!\d)(\d+)조/g

// 질문 종결어미 패턴
export const QUESTION_ENDINGS = /[?？]$|인가요?$|인지요?$|될까요?$|되나요?$|습니까?$|니까?$|알려줘|설명해줘|가르쳐줘|말해줘|찾아줘|보여줘|궁금|뭐야|뭐지|뭔지|뭘까$|방법$|절차$|요건$|조건$|기준$|대상$/

// 질문 의문사 패턴
export const QUESTION_WORDS = /(무엇|어떻게|어떤|왜|언제|어디서|누가|어느|뭐|뭘)/

// 순수 법령명 패턴
export const PURE_LAW_NAME_PATTERN = /^[가-힣A-Za-z0-9·\s]+(?:법률\s*시행령|법률\s*시행규칙|법\s*시행령|법\s*시행규칙|특별법|기본법|법률|법|령|규칙|규정|조례|지침|고시|훈령|예규)$/

// 일반 단어 제외 목록 (법령명으로 오인되기 쉬운 단어)
export const EXCLUDED_WORDS = ['방법', '절차', '요건', '조건']

/**
 * 텍스트가 순수 법령명인지 확인
 */
export function isPureLawName(text: string): boolean {
  const trimmed = text.trim()

  // 제외 단어 확인
  if (EXCLUDED_WORDS.includes(trimmed)) {
    return false
  }

  return PURE_LAW_NAME_PATTERN.test(trimmed)
}

/**
 * 법령명 띄어쓰기 정규화
 * "관세법시행령" → "관세법 시행령"
 */
export function normalizeLawName(lawName: string): string {
  return lawName
    .replace(/(법)(시행령)/, '$1 $2')
    .replace(/(법)(시행규칙)/, '$1 $2')
    .replace(/(령)(시행규칙)/, '$1 $2')
}
