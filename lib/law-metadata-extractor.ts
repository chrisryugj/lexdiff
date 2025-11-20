/**
 * Law Metadata Extractor
 *
 * Extracts metadata from parsed law Markdown files for Google File Search
 *
 * Usage:
 *   import { extractLawMetadata } from '@/lib/law-metadata-extractor'
 *   const metadata = extractLawMetadata(markdownContent, fileName)
 */

export interface ExtractedLawMetadata {
  law_id: string
  law_name: string
  law_type: '법률' | '조례' | '시행령' | '시행규칙'
  effective_date?: string
  category?: string
  region?: string
  total_articles: string
}

/**
 * Extract metadata from Markdown content
 *
 * Parses structured Markdown headers to extract law metadata:
 * - Law ID from "**법령 ID**: 001556"
 * - Law name from "# 관세법"
 * - Effective date from "**시행일**: 2025년 11월 11일"
 * - Article count from "**조문 수**: 423개"
 *
 * @param markdownContent - Full Markdown file content
 * @param fileName - Original file name (fallback for law name)
 * @returns Extracted metadata object
 */
export function extractLawMetadata(
  markdownContent: string,
  fileName: string
): ExtractedLawMetadata {
  // 1. Extract law name (from Markdown header or filename)
  const lawNameMatch = markdownContent.match(/^# (.+)$/m)
  const lawName = lawNameMatch?.[1]?.trim() || fileName.replace('.md', '')

  // 2. Extract law ID
  const lawIdMatch = markdownContent.match(/\*\*법령 ID\*\*:\s*(.+)$/m)
  const lawId = lawIdMatch?.[1]?.trim() || 'unknown'

  // 3. Extract effective date
  const effectiveDateMatch = markdownContent.match(/\*\*시행일\*\*:\s*(.+)$/m)
  let effectiveDate = effectiveDateMatch?.[1]?.trim()

  // Convert "2025년 11월 11일" → "20251111"
  if (effectiveDate) {
    const dateMatch = effectiveDate.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
    if (dateMatch) {
      const [, year, month, day] = dateMatch
      effectiveDate = `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`
    }
  }

  // 4. Extract article count
  const articleCountMatch = markdownContent.match(/\*\*조문 수\*\*:\s*(\d+)/m)
  const totalArticles = articleCountMatch?.[1] || '0'

  // 5. Detect law type (법률, 시행령, 시행규칙, 조례)
  const lawType = detectLawType(lawName)

  // 6. Extract region (for ordinances)
  const region = lawType === '조례' ? extractRegion(lawName) : undefined

  // 7. Extract category (optional, if available in Markdown)
  const categoryMatch = markdownContent.match(/\*\*분류\*\*:\s*(.+)$/m)
  const category = categoryMatch?.[1]?.trim()

  return {
    law_id: lawId,
    law_name: lawName,
    law_type: lawType,
    effective_date: effectiveDate,
    total_articles: totalArticles,
    region,
    category
  }
}

/**
 * Detect law type from law name
 *
 * Priority:
 * 1. 시행규칙 (ends with "시행규칙")
 * 2. 시행령 (ends with "시행령")
 * 3. 조례 (contains "조례" or "규칙", or has regional pattern)
 * 4. 법률 (default)
 *
 * Examples:
 * - "관세법" → 법률
 * - "관세법 시행령" → 시행령
 * - "관세법 시행규칙" → 시행규칙
 * - "서울특별시 조례" → 조례
 *
 * @param lawName - Law name to analyze
 * @returns Law type classification
 */
export function detectLawType(lawName: string): '법률' | '조례' | '시행령' | '시행규칙' {
  // Priority order: 시행규칙 > 시행령 > 조례 > 법률
  if (/시행규칙$/.test(lawName)) {
    return '시행규칙'
  }

  if (/시행령$/.test(lawName)) {
    return '시행령'
  }

  // Check for ordinance keywords
  if (/조례|규칙/.test(lawName)) {
    return '조례'
  }

  // Check for regional pattern (지역명 + 법령명)
  // Matches: 서울특별시, 부산광역시, 경기도, 강남구 etc.
  if (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName)) {
    return '조례'
  }

  // Default: 법률
  return '법률'
}

/**
 * Extract region from ordinance name
 *
 * Extracts regional identifier from ordinance law names:
 * - "서울특별시 조례" → "서울특별시"
 * - "강남구 조례" → "강남구"
 *
 * @param lawName - Ordinance name
 * @returns Region name or undefined
 */
export function extractRegion(lawName: string): string | undefined {
  const match = lawName.match(/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))/)
  return match?.[0]
}

/**
 * Validate extracted metadata
 *
 * Checks if extracted metadata is valid and complete:
 * - law_id must not be "unknown"
 * - law_name must not be empty
 * - effective_date must be 8-digit format (if present)
 *
 * @param metadata - Extracted metadata to validate
 * @returns Validation result with error messages
 */
export function validateMetadata(metadata: ExtractedLawMetadata): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (metadata.law_id === 'unknown') {
    errors.push('법령 ID를 찾을 수 없습니다')
  }

  if (!metadata.law_name || metadata.law_name.trim() === '') {
    errors.push('법령명을 찾을 수 없습니다')
  }

  if (metadata.effective_date && !/^\d{8}$/.test(metadata.effective_date)) {
    errors.push(`시행일 형식이 올바르지 않습니다: ${metadata.effective_date}`)
  }

  if (metadata.total_articles === '0') {
    errors.push('조문 수가 0입니다')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
