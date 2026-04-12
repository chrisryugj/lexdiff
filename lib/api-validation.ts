/**
 * API 입력 검증 유틸리티
 *
 * Zod 스키마를 사용한 입력 검증으로 보안 강화
 */

import { z } from 'zod'

/**
 * 검색 쿼리 스키마
 * - XSS 방지: 특수문자 제한
 * - 길이 제한: 1~500자
 */
export const searchQuerySchema = z.string()
  .min(1, '검색어를 입력해주세요')
  .max(500, '검색어가 너무 깁니다 (최대 500자)')
  .transform(val => val.trim())
  // HTML 태그 제거 (XSS 방지)
  .transform(val => val.replace(/<[^>]*>/g, ''))
  // 스크립트 관련 키워드 제거
  .transform(val => val.replace(/javascript:|data:|vbscript:/gi, ''))

/**
 * 법령 MST (법령일련번호) 스키마
 * - 6자리 숫자
 */
export const lawMstSchema = z.string()
  .regex(/^\d{6}$/, '법령일련번호는 6자리 숫자여야 합니다')

/**
 * JO 코드 (조문번호) 스키마
 * - 6자리 숫자 (AAAABB 형식)
 */
export const joCodeSchema = z.string()
  .regex(/^\d{6}$/, 'JO 코드는 6자리 숫자여야 합니다')

/**
 * 날짜 스키마 (YYYYMMDD)
 */
export const dateSchema = z.string()
  .regex(/^\d{8}$/, '날짜는 YYYYMMDD 형식이어야 합니다')
  .refine(val => {
    const year = parseInt(val.slice(0, 4))
    const month = parseInt(val.slice(4, 6))
    const day = parseInt(val.slice(6, 8))
    return year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31
  }, '유효하지 않은 날짜입니다')

/**
 * 법령명 스키마
 */
export const lawNameSchema = z.string()
  .min(1, '법령명을 입력해주세요')
  .max(200, '법령명이 너무 깁니다')
  .transform(val => val.trim())
  // 한글, 영문, 숫자, 공백, 일부 특수문자만 허용
  .refine(val => /^[가-힣a-zA-Z0-9\s·()「」]+$/.test(val), '허용되지 않은 문자가 포함되어 있습니다')

/**
 * 페이지네이션 스키마
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * RAG 요청 스키마 (fc-rag POST body)
 */
export const ragRequestSchema = z.object({
  query: z.string()
    .min(1, 'Query is required')
    .max(2000, 'Query too long (max 2000 chars)')
    .transform(val => val.trim())
    .transform(val => val.replace(/<[^>]*>/g, ''))
    .transform(val => val.replace(/javascript:|data:|vbscript:/gi, '')),
  // H-SEC2: UUID v4 또는 최소 엔트로피 포맷만 허용. 짧은/예측 가능한 ID는
  // 타 세션 대화 기록 열람 가능성 → 400.
  // 허용: crypto.randomUUID() 결과 (UUID v4) 또는 16자+ base36/hex.
  conversationId: z.string()
    .regex(/^[0-9a-zA-Z_-]{16,64}$/, 'conversationId must be 16-64 chars [A-Za-z0-9_-]')
    .optional(),
  preEvidence: z.string().max(5000).optional(),
  metadataFilter: z.string().optional(),
})

/**
 * 법령 조회 요청 스키마
 */
export const lawRequestSchema = z.object({
  MST: lawMstSchema.optional(),
  JO: joCodeSchema.optional(),
  lawName: lawNameSchema.optional(),
  date: dateSchema.optional(),
})

/**
 * 비교 요청 스키마
 */
export const comparisonRequestSchema = z.object({
  lawName: lawNameSchema,
  effectiveDate1: dateSchema.optional(),
  effectiveDate2: dateSchema.optional(),
})

/**
 * 현행법령(eflaw) 조회 요청 스키마
 * - lawId 또는 mst 중 하나 필수
 */
export const eflawRequestSchema = z.object({
  lawId: z.string().max(100).optional(),
  mst: z.string().max(20).optional(),
  efYd: z.string().regex(/^\d{8}$/, '날짜는 YYYYMMDD 형식이어야 합니다').optional(),
  jo: z.string().max(20).optional(),
}).refine(data => data.lawId || data.mst, {
  message: 'lawId 또는 mst가 필요합니다',
})

/**
 * 법령 HTML 조회 요청 스키마
 */
export const lawHtmlRequestSchema = z.object({
  url: z.string().max(2000).optional(),
  lawName: z.string().max(200).optional(),
  joLabel: z.string().max(100).optional(),
  debug: z.enum(['0', '1']).optional(),
})

/**
 * 검증 결과 타입
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * 안전한 검증 헬퍼
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errorMessage = result.error.errors
    .map(e => e.message)
    .join(', ')

  return { success: false, error: errorMessage }
}

/**
 * Request에서 검색 파라미터 추출 및 검증
 */
export function validateSearchParams(
  searchParams: URLSearchParams
): ValidationResult<Record<string, string>> {
  const params: Record<string, string> = {}

  for (const [key, value] of searchParams.entries()) {
    // 키 검증: 영문, 숫자, 언더스코어만 허용
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      return { success: false, error: `잘못된 파라미터 키: ${key}` }
    }

    // 값 검증: 기본 XSS 방지
    const sanitizedValue = value
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:|data:|vbscript:/gi, '')

    params[key] = sanitizedValue
  }

  return { success: true, data: params }
}

/**
 * API 에러 응답 생성
 */
export function createErrorResponse(
  message: string,
  status: number = 400
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
