import { parseSearchQuery } from './law-parser'

export interface QueryVariant {
  variant: string
  type: 'spacing' | 'article_format' | 'number_format' | 'typo' | 'alias'
  confidence: number
}

// 검색어 변형 생성
export function generateVariants(query: string): QueryVariant[] {
  const variants: QueryVariant[] = []
  const parsed = parseSearchQuery(query)

  if (!parsed.lawName) return variants

  // 1. 공백 변형
  variants.push(...generateSpacingVariants(query))

  // 2. 조문 표기 변형
  if (parsed.article) {
    variants.push(...generateArticleFormatVariants(parsed))
  }

  // 3. 숫자 표기 변형
  if (parsed.article) {
    variants.push(...generateNumberFormatVariants(parsed))
  }

  // 중복 제거
  const unique = new Map<string, QueryVariant>()
  for (const variant of variants) {
    if (variant.variant !== query && !unique.has(variant.variant)) {
      unique.set(variant.variant, variant)
    }
  }

  return Array.from(unique.values())
}

// 공백 변형 생성
function generateSpacingVariants(query: string): QueryVariant[] {
  const variants: QueryVariant[] = []

  // 공백 제거
  const noSpace = query.replace(/\s+/g, '')
  if (noSpace !== query) {
    variants.push({ variant: noSpace, type: 'spacing', confidence: 0.95 })
  }

  // 공백 추가
  const withSpace = query.replace(/([가-힣]+)(\d+)/g, '$1 $2')
  if (withSpace !== query) {
    variants.push({ variant: withSpace, type: 'spacing', confidence: 0.95 })
  }

  return variants
}

// 조문 표기 변형 생성
function generateArticleFormatVariants(parsed: ReturnType<typeof parseSearchQuery>): QueryVariant[] {
  const variants: QueryVariant[] = []
  const { lawName, article } = parsed

  if (!article) return variants

  // "38조" vs "제38조"
  if (article.startsWith('제')) {
    const withoutJe = article.replace('제', '')
    variants.push({
      variant: `${lawName} ${withoutJe}`,
      type: 'article_format',
      confidence: 0.98,
    })
  } else if (/^\d+조/.test(article)) {
    variants.push({
      variant: `${lawName} 제${article}`,
      type: 'article_format',
      confidence: 0.98,
    })
  }

  // "제38조" vs "제 38조"
  const articleWithSpace = article.replace(/제(\d+)/, '제 $1')
  if (articleWithSpace !== article) {
    variants.push({
      variant: `${lawName} ${articleWithSpace}`,
      type: 'article_format',
      confidence: 0.95,
    })
  }

  return variants
}

// 숫자 표기 변형 생성
function generateNumberFormatVariants(parsed: ReturnType<typeof parseSearchQuery>): QueryVariant[] {
  const variants: QueryVariant[] = []
  const { lawName, article } = parsed

  if (!article) return variants

  // 숫자 추출
  const numberMatch = article.match(/\d+/)
  if (!numberMatch) return variants

  const number = parseInt(numberMatch[0])

  // 한글 숫자 변환
  const koreanNumber = convertToKoreanNumber(number)
  if (koreanNumber) {
    const prefix = article.startsWith('제') ? '제' : ''
    const suffix = article.includes('조') ? '조' : ''

    variants.push({
      variant: `${lawName} ${prefix}${koreanNumber}${suffix}`,
      type: 'number_format',
      confidence: 0.85,
    })
  }

  // "의" 표기 처리 (예: "10조의2")
  if (article.includes('의')) {
    const simplified = article.replace(/의(\d+)/, '-$1')
    variants.push({
      variant: `${lawName} ${simplified}`,
      type: 'article_format',
      confidence: 0.90,
    })
  }

  return variants
}

// 숫자를 한글로 변환
function convertToKoreanNumber(num: number): string | null {
  if (num < 1 || num > 999) return null

  const units = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const tens = ['', '십', '이십', '삼십', '사십', '오십', '육십', '칠십', '팔십', '구십']
  const hundreds = ['', '백', '이백', '삼백', '사백', '오백', '육백', '칠백', '팔백', '구백']

  if (num < 10) return units[num]
  if (num < 100) {
    const ten = Math.floor(num / 10)
    const unit = num % 10
    return tens[ten] + (unit > 0 ? units[unit] : '')
  }

  const hundred = Math.floor(num / 100)
  const remainder = num % 100
  const ten = Math.floor(remainder / 10)
  const unit = remainder % 10

  return hundreds[hundred] + (ten > 0 ? tens[ten] : '') + (unit > 0 ? units[unit] : '')
}

// 변형 그룹 생성 (대표 쿼리 + 변형들)
export function createVariantGroup(canonicalQuery: string) {
  const variants = generateVariants(canonicalQuery)

  return {
    canonical: canonicalQuery,
    variants: variants.map(v => ({
      query: v.variant,
      type: v.type,
      confidence: v.confidence,
    })),
  }
}