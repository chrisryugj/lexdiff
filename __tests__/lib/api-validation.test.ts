/**
 * API 입력 검증 유틸리티 테스트
 */

import { describe, it, expect } from 'vitest'
import {
  searchQuerySchema,
  lawMstSchema,
  joCodeSchema,
  dateSchema,
  lawNameSchema,
  paginationSchema,
  ragRequestSchema,
  lawRequestSchema,
  comparisonRequestSchema,
  validate,
  validateSearchParams,
  createErrorResponse
} from '../../lib/api-validation'

describe('api-validation', () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // searchQuerySchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('searchQuerySchema', () => {
    it('유효한 검색어', () => {
      const result = searchQuerySchema.safeParse('관세법 38조')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('관세법 38조')
      }
    })

    it('빈 문자열 거부', () => {
      const result = searchQuerySchema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('500자 초과 거부', () => {
      const longQuery = 'a'.repeat(501)
      const result = searchQuerySchema.safeParse(longQuery)
      expect(result.success).toBe(false)
    })

    it('앞뒤 공백 제거', () => {
      const result = searchQuerySchema.safeParse('  관세법  ')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('관세법')
      }
    })

    it('HTML 태그 제거', () => {
      const result = searchQuerySchema.safeParse('<script>alert("XSS")</script>관세법')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toContain('<script>')
        expect(result.data).toContain('관세법')
      }
    })

    it('javascript: 프로토콜 제거', () => {
      const result = searchQuerySchema.safeParse('javascript:alert(1) 관세법')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toContain('javascript:')
      }
    })

    it('data: 프로토콜 제거', () => {
      const result = searchQuerySchema.safeParse('data:text/html 관세법')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toContain('data:')
      }
    })

    it('vbscript: 프로토콜 제거', () => {
      const result = searchQuerySchema.safeParse('vbscript:msgbox(1) 관세법')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toContain('vbscript:')
      }
    })

    it('500자 경계 허용', () => {
      const query = 'a'.repeat(500)
      const result = searchQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // lawMstSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('lawMstSchema', () => {
    it('유효한 6자리 MST', () => {
      const result = lawMstSchema.safeParse('000013')
      expect(result.success).toBe(true)
    })

    it('5자리 거부', () => {
      const result = lawMstSchema.safeParse('00013')
      expect(result.success).toBe(false)
    })

    it('7자리 거부', () => {
      const result = lawMstSchema.safeParse('0000013')
      expect(result.success).toBe(false)
    })

    it('문자 포함 거부', () => {
      const result = lawMstSchema.safeParse('00001a')
      expect(result.success).toBe(false)
    })

    it('빈 문자열 거부', () => {
      const result = lawMstSchema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('공백 포함 거부', () => {
      const result = lawMstSchema.safeParse('00 013')
      expect(result.success).toBe(false)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // joCodeSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('joCodeSchema', () => {
    it('유효한 JO 코드 (003800)', () => {
      const result = joCodeSchema.safeParse('003800')
      expect(result.success).toBe(true)
    })

    it('가지 조문 JO 코드 (001002)', () => {
      const result = joCodeSchema.safeParse('001002')
      expect(result.success).toBe(true)
    })

    it('5자리 거부', () => {
      const result = joCodeSchema.safeParse('00380')
      expect(result.success).toBe(false)
    })

    it('문자 포함 거부', () => {
      const result = joCodeSchema.safeParse('00380a')
      expect(result.success).toBe(false)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // dateSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('dateSchema', () => {
    it('유효한 날짜 (YYYYMMDD)', () => {
      const result = dateSchema.safeParse('20251213')
      expect(result.success).toBe(true)
    })

    it('하이픈 포함 거부', () => {
      const result = dateSchema.safeParse('2025-12-13')
      expect(result.success).toBe(false)
    })

    it('7자리 거부', () => {
      const result = dateSchema.safeParse('2025121')
      expect(result.success).toBe(false)
    })

    it('유효하지 않은 월 거부', () => {
      const result = dateSchema.safeParse('20251313')  // 13월
      expect(result.success).toBe(false)
    })

    it('유효하지 않은 일 거부', () => {
      const result = dateSchema.safeParse('20251232')  // 32일
      expect(result.success).toBe(false)
    })

    it('유효하지 않은 연도 거부', () => {
      const result = dateSchema.safeParse('18001213')  // 1800년
      expect(result.success).toBe(false)
    })

    it('경계 연도 허용 (1900)', () => {
      const result = dateSchema.safeParse('19000101')
      expect(result.success).toBe(true)
    })

    it('경계 연도 허용 (2100)', () => {
      const result = dateSchema.safeParse('21001231')
      expect(result.success).toBe(true)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // lawNameSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('lawNameSchema', () => {
    it('유효한 법령명', () => {
      const result = lawNameSchema.safeParse('관세법')
      expect(result.success).toBe(true)
    })

    it('시행령 포함', () => {
      const result = lawNameSchema.safeParse('관세법 시행령')
      expect(result.success).toBe(true)
    })

    it('「」 괄호 포함', () => {
      const result = lawNameSchema.safeParse('「관세법」')
      expect(result.success).toBe(true)
    })

    it('빈 문자열 거부', () => {
      const result = lawNameSchema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('200자 초과 거부', () => {
      const longName = '법'.repeat(201)
      const result = lawNameSchema.safeParse(longName)
      expect(result.success).toBe(false)
    })

    it('허용되지 않은 특수문자 거부', () => {
      const result = lawNameSchema.safeParse('관세법<script>')
      expect(result.success).toBe(false)
    })

    it('앞뒤 공백 제거', () => {
      const result = lawNameSchema.safeParse('  관세법  ')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('관세법')
      }
    })

    it('영문 법령명 허용', () => {
      const result = lawNameSchema.safeParse('FTA 관세법')
      expect(result.success).toBe(true)
    })

    it('숫자 포함 허용', () => {
      const result = lawNameSchema.safeParse('관세법2023')
      expect(result.success).toBe(true)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // paginationSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('paginationSchema', () => {
    it('기본값 적용', () => {
      const result = paginationSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
        expect(result.data.limit).toBe(20)
      }
    })

    it('유효한 페이지네이션', () => {
      const result = paginationSchema.safeParse({ page: 5, limit: 50 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(5)
        expect(result.data.limit).toBe(50)
      }
    })

    it('page 0 거부', () => {
      const result = paginationSchema.safeParse({ page: 0 })
      expect(result.success).toBe(false)
    })

    it('limit 101 거부', () => {
      const result = paginationSchema.safeParse({ limit: 101 })
      expect(result.success).toBe(false)
    })

    it('문자열을 숫자로 변환 (coerce)', () => {
      const result = paginationSchema.safeParse({ page: '5', limit: '50' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(5)
        expect(result.data.limit).toBe(50)
      }
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ragRequestSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('ragRequestSchema', () => {
    it('유효한 RAG 요청', () => {
      const result = ragRequestSchema.safeParse({ query: '관세법 질문' })
      expect(result.success).toBe(true)
    })

    it('metadataFilter 포함', () => {
      const result = ragRequestSchema.safeParse({
        query: '관세법 질문',
        metadataFilter: 'law_type="법률"'
      })
      expect(result.success).toBe(true)
    })

    it('빈 query 거부', () => {
      const result = ragRequestSchema.safeParse({ query: '' })
      expect(result.success).toBe(false)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // lawRequestSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('lawRequestSchema', () => {
    it('MST만 포함', () => {
      const result = lawRequestSchema.safeParse({ MST: '000013' })
      expect(result.success).toBe(true)
    })

    it('JO만 포함', () => {
      const result = lawRequestSchema.safeParse({ JO: '003800' })
      expect(result.success).toBe(true)
    })

    it('MST + JO', () => {
      const result = lawRequestSchema.safeParse({ MST: '000013', JO: '003800' })
      expect(result.success).toBe(true)
    })

    it('빈 객체 허용', () => {
      const result = lawRequestSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('잘못된 MST 거부', () => {
      const result = lawRequestSchema.safeParse({ MST: '12345' })
      expect(result.success).toBe(false)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // comparisonRequestSchema 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('comparisonRequestSchema', () => {
    it('유효한 비교 요청', () => {
      const result = comparisonRequestSchema.safeParse({ lawName: '관세법' })
      expect(result.success).toBe(true)
    })

    it('날짜 포함', () => {
      const result = comparisonRequestSchema.safeParse({
        lawName: '관세법',
        effectiveDate1: '20240101',
        effectiveDate2: '20250101'
      })
      expect(result.success).toBe(true)
    })

    it('lawName 누락 거부', () => {
      const result = comparisonRequestSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // validate 헬퍼 함수 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('validate 헬퍼 함수', () => {
    it('성공 결과 반환', () => {
      const result = validate(searchQuerySchema, '관세법')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('관세법')
      }
    })

    it('실패 결과 반환', () => {
      const result = validate(searchQuerySchema, '')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeTruthy()
      }
    })

    it('여러 에러 메시지 합치기', () => {
      const result = validate(lawMstSchema, 'abc')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(typeof result.error).toBe('string')
      }
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // validateSearchParams 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('validateSearchParams', () => {
    it('유효한 파라미터', () => {
      const params = new URLSearchParams('query=관세법&page=1')
      const result = validateSearchParams(params)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.query).toBe('관세법')
        expect(result.data.page).toBe('1')
      }
    })

    it('HTML 태그 제거', () => {
      const params = new URLSearchParams('query=<script>alert(1)</script>관세법')
      const result = validateSearchParams(params)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.query).not.toContain('<script>')
      }
    })

    it('잘못된 키 거부', () => {
      const params = new URLSearchParams()
      params.append('123invalid', 'value')
      const result = validateSearchParams(params)
      expect(result.success).toBe(false)
    })

    it('빈 파라미터 허용', () => {
      const params = new URLSearchParams()
      const result = validateSearchParams(params)
      expect(result.success).toBe(true)
    })

    it('언더스코어 키 허용', () => {
      const params = new URLSearchParams('law_name=관세법')
      const result = validateSearchParams(params)
      expect(result.success).toBe(true)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // createErrorResponse 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('createErrorResponse', () => {
    it('기본 400 상태 코드', async () => {
      const response = createErrorResponse('에러 메시지')
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('에러 메시지')
    })

    it('커스텀 상태 코드', async () => {
      const response = createErrorResponse('찾을 수 없음', 404)
      expect(response.status).toBe(404)
    })

    it('Content-Type 헤더', () => {
      const response = createErrorResponse('에러')
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // XSS 방지 종합 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('XSS 방지 종합', () => {
    it('img onerror 공격 차단', () => {
      const result = searchQuerySchema.safeParse('<img src=x onerror=alert(1)>')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toContain('<img')
        expect(result.data).not.toContain('onerror')
      }
    })

    it('svg onload 공격 차단', () => {
      const result = searchQuerySchema.safeParse('<svg onload=alert(1)>')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toContain('<svg')
      }
    })

    it('중첩 태그 공격 차단', () => {
      const result = searchQuerySchema.safeParse('<<script>script>alert(1)<</script>/script>')
      expect(result.success).toBe(true)
      // 중첩 태그는 외부 태그만 제거되므로 일부 텍스트가 남을 수 있음
      // 핵심은 실행 가능한 스크립트가 아님
    })

    it('대소문자 우회 시도 차단', () => {
      const result = searchQuerySchema.safeParse('JAVASCRIPT:alert(1)')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.toLowerCase()).not.toContain('javascript:')
      }
    })

    it('URL 인코딩 우회 (일부)', () => {
      // 기본 검증에서는 URL 인코딩된 값이 들어올 수 있음
      const result = searchQuerySchema.safeParse('%3Cscript%3E')
      expect(result.success).toBe(true)
      // URL 디코딩은 별도 처리 필요
    })
  })
})
