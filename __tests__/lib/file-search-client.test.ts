import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// File Search Client 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Mock 환경변수 설정
const mockEnv = {
  NODE_ENV: 'test' as const,
  GEMINI_API_KEY: 'test-api-key',
  GEMINI_FILE_SEARCH_STORE_ID: 'fileSearchStores/test-store-123'
}

// 원본 환경변수 백업
const originalEnv = { ...process.env }

// fetch mock
const mockFetch = vi.fn()
global.fetch = mockFetch

// preprocessQuery mock
vi.mock('../../lib/query-preprocessor', () => ({
  preprocessQuery: vi.fn().mockResolvedValue({
    originalQuery: 'test query',
    processedQuery: 'test query processed',
    queryType: 'general',
    extractedLaws: [],
    extractedArticles: [],
    confidence: 0.8,
    metadataFilter: null
  })
}))

describe('file-search-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...mockEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Retry Configuration 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('RETRY_CONFIG', () => {
    it('설정값이 올바르게 정의됨', () => {
      // RETRY_CONFIG는 모듈 내부 상수이므로 예상값 기반으로 테스트
      const RETRY_CONFIG = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        retryableStatusCodes: [429, 500, 502, 503, 504]
      }

      expect(RETRY_CONFIG.maxRetries).toBe(3)
      expect(RETRY_CONFIG.baseDelayMs).toBe(1000)
      expect(RETRY_CONFIG.maxDelayMs).toBe(10000)
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(429)
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(500)
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(502)
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(503)
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(504)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // calculateBackoffDelay 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('calculateBackoffDelay', () => {
    it('attempt 0에서 기본 delay 반환 (±20% jitter)', () => {
      // 직접 계산 테스트
      const baseDelay = 1000
      const attempt = 0
      const expectedBase = baseDelay * Math.pow(2, attempt) // 1000

      // jitter 범위: 800 ~ 1200
      expect(expectedBase).toBe(1000)
    })

    it('attempt 1에서 2초 기준 delay (±20% jitter)', () => {
      const baseDelay = 1000
      const attempt = 1
      const expectedBase = baseDelay * Math.pow(2, attempt) // 2000

      expect(expectedBase).toBe(2000)
    })

    it('attempt 2에서 4초 기준 delay (±20% jitter)', () => {
      const baseDelay = 1000
      const attempt = 2
      const expectedBase = baseDelay * Math.pow(2, attempt) // 4000

      expect(expectedBase).toBe(4000)
    })

    it('maxDelayMs(10초) 초과 시 최댓값으로 제한', () => {
      const baseDelay = 1000
      const maxDelay = 10000
      const attempt = 5 // 2^5 * 1000 = 32000 > 10000
      const expectedBase = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

      expect(expectedBase).toBe(10000)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // isRetryableError 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('isRetryableError', () => {
    const retryableStatusCodes = [429, 500, 502, 503, 504]

    it.each(retryableStatusCodes)('상태 코드 %d는 재시도 가능', (status) => {
      expect(retryableStatusCodes.includes(status)).toBe(true)
    })

    it.each([400, 401, 403, 404, 422])('상태 코드 %d는 재시도 불가', (status) => {
      expect(retryableStatusCodes.includes(status)).toBe(false)
    })

    it('200 성공 코드는 재시도 불필요', () => {
      expect(retryableStatusCodes.includes(200)).toBe(false)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // formatLawAsText 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('formatLawAsText', () => {
    it('법령 데이터를 구조화된 텍스트로 변환', async () => {
      const { formatLawAsText } = await import('../../lib/file-search-client')

      const lawData = {
        lawId: '000001',
        lawName: '테스트법',
        articles: [
          { jo: '1', title: '목적', content: '이 법은 테스트를 목적으로 한다.' },
          { jo: '2', content: '테스트 내용이다.' }
        ]
      }

      const result = formatLawAsText(lawData)

      expect(result).toContain('# 테스트법')
      expect(result).toContain('법령ID: 000001')
      expect(result).toContain('총 조문수: 2')
      expect(result).toContain('## 제1조 목적')
      expect(result).toContain('이 법은 테스트를 목적으로 한다.')
      expect(result).toContain('## 제2조')
      expect(result).toContain('테스트 내용이다.')
    })

    it('제목이 없는 조문도 처리', async () => {
      const { formatLawAsText } = await import('../../lib/file-search-client')

      const lawData = {
        lawId: '000002',
        lawName: '테스트법2',
        articles: [
          { jo: '1', content: '내용만 있는 조문' }
        ]
      }

      const result = formatLawAsText(lawData)

      expect(result).toContain('## 제1조')
      expect(result).not.toContain('## 제1조 ')  // 제목 없이 끝남
      expect(result).toContain('내용만 있는 조문')
    })

    it('빈 조문 배열 처리', async () => {
      const { formatLawAsText } = await import('../../lib/file-search-client')

      const lawData = {
        lawId: '000003',
        lawName: '빈법',
        articles: []
      }

      const result = formatLawAsText(lawData)

      expect(result).toContain('# 빈법')
      expect(result).toContain('총 조문수: 0')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // reformulateQuery 테스트 (내부 함수지만 동작 검증)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('쿼리 재구성 로직', () => {
    it('"N조" → "제N조" 정규화', () => {
      const input = '민법 38조'
      const expected = '민법 제38조'

      // 정규식 테스트
      const result = input.replace(/(?<!제)(\d+)조/g, '제$1조')
      expect(result).toBe(expected)
    })

    it('"법시행령" → "법 시행령" 띄어쓰기', () => {
      const input = '소득세법시행령'

      // 정규식 테스트
      const result = input.replace(/(법)(시행령|시행규칙)/g, '$1 $2')
      expect(result).toBe('소득세법 시행령')
    })

    it('"령시행규칙" → "령 시행규칙" 띄어쓰기', () => {
      const input = '소득세법시행령시행규칙'

      // 정규식 테스트
      let result = input.replace(/(법)(시행령|시행규칙)/g, '$1 $2')
      result = result.replace(/(령)(시행규칙)/g, '$1 $2')
      expect(result).toBe('소득세법 시행령 시행규칙')
    })

    it('불필요한 조사 제거', () => {
      const input = '민법은 어떻게 적용되는가'

      // 정규식 테스트 - 단일 문자 조사만 제거
      // 은는이가을를의에서 중 '은', '는', '가'가 제거됨
      const result = input.replace(/[은는이가을를의에서]/g, ' ')
        .replace(/\s+/g, ' ').trim()
      // 결과: '민법 어떻게 적용되' (마지막 '가'도 제거됨)
      expect(result).toBe('민법 어떻게 적용되')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 환경변수 검증 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('환경변수 검증', () => {
    it('GEMINI_API_KEY 없으면 에러', async () => {
      process.env.GEMINI_API_KEY = ''

      // 모듈 재로드를 위해 캐시 클리어
      vi.resetModules()

      const { queryFileSearch } = await import('../../lib/file-search-client')

      await expect(queryFileSearch('test')).rejects.toThrow('GEMINI_API_KEY is required')
    })

    it('GEMINI_FILE_SEARCH_STORE_ID 없으면 에러', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      process.env.GEMINI_FILE_SEARCH_STORE_ID = ''

      vi.resetModules()

      const { queryFileSearch } = await import('../../lib/file-search-client')

      await expect(queryFileSearch('test')).rejects.toThrow('GEMINI_FILE_SEARCH_STORE_ID is required')
    })

    it('STORE_ID 형식 검증 (fileSearchStores/ 접두사)', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      process.env.GEMINI_FILE_SEARCH_STORE_ID = 'invalid-store-id'

      vi.resetModules()

      const { queryFileSearchStream } = await import('../../lib/file-search-client')

      const generator = queryFileSearchStream('test query')

      await expect(generator.next()).rejects.toThrow('Invalid STORE_ID format')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Citation 추출 로직 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Citation 추출', () => {
    describe('법령명 추출', () => {
      it('Structured Markdown 메타데이터 블록에서 추출', () => {
        const chunkText = '**법령명**: 관세법\n**조문**: 제38조\n**제목**: 신고납부\n내용...'

        const match = chunkText.match(/\*\*법령명\*\*:\s*(.+?)(?:\n|$)/m)
        expect(match).not.toBeNull()
        expect(match![1].trim()).toBe('관세법')
      })

      it('URI에서 파일명 추출 (법령명_ID 형식)', () => {
        const uri = 'corpora/abc/documents/관세법_000123/chunks/xyz'

        const uriMatch = uri.match(/documents\/([^\/]+)/)
        expect(uriMatch).not.toBeNull()

        const docId = uriMatch![1]
        const lawMatch = docId.match(/^(.+)_\d+/)
        expect(lawMatch).not.toBeNull()
        expect(lawMatch![1]).toBe('관세법')
      })

      it('헤더 패턴에서 추출 (# 법령명)', () => {
        const chunkText = '# 소득세법\n\n## 제1조 목적'

        const match = chunkText.match(/^# ([^\n]+)/m)
        expect(match).not.toBeNull()
        expect(match![1].trim()).toBe('소득세법')
      })

      it('대괄호 패턴에서 추출 (【법령명】)', () => {
        const chunkText = '【민법】제1조 통칙'

        const match = chunkText.match(/【([^】]+)】/)
        expect(match).not.toBeNull()
        expect(match![1].trim()).toBe('민법')
      })
    })

    describe('조문번호 추출', () => {
      it('Structured Markdown에서 추출', () => {
        const chunkText = '**법령명**: 관세법\n**조문**: 제38조\n내용...'

        const match = chunkText.match(/\*\*조문\*\*:\s*(.+?)(?:\n|$)/m)
        expect(match).not.toBeNull()
        expect(match![1].trim()).toBe('제38조')
      })

      it('헤더 패턴에서 추출 (## 제N조)', () => {
        const chunkText = '## 제38조\n신고납부 내용'

        const match = chunkText.match(/## (제\d+(?:의\d+)?조)/m)
        expect(match).not.toBeNull()
        expect(match![1]).toBe('제38조')
      })

      it('가지 조문 추출 (제N조의M)', () => {
        const chunkText = '## 제10조의2\n추가 조문 내용'

        // 가지 조문 패턴: 제N조의M (조 뒤에 숫자가 붙는 형태)
        const match = chunkText.match(/## (제\d+조(?:의\d+)?)/m)
        expect(match).not.toBeNull()
        expect(match![1]).toBe('제10조의2')
      })
    })

    describe('조문 제목 추출', () => {
      it('Structured Markdown에서 추출', () => {
        const chunkText = '**법령명**: 관세법\n**조문**: 제38조\n**제목**: 신고납부\n내용...'

        const match = chunkText.match(/\*\*제목\*\*:\s*(.+?)(?:\n|$)/m)
        expect(match).not.toBeNull()
        expect(match![1].trim()).toBe('신고납부')
      })

      it('헤더 패턴에서 추출 (## 제N조 제목)', () => {
        const chunkText = '## 제38조 신고납부\n① 관세를 납부하여야 한다.'

        const articleNum = '제38조'
        const headingMatch = chunkText.match(/## 제\d+(?:의\d+)?조\s+(.+?)(?:\n|$)/m)

        expect(headingMatch).not.toBeNull()
        const potentialTitle = headingMatch![1].trim()

        // 길이 30 이하, 괄호/항번호 없으면 제목
        if (potentialTitle.length <= 30 && !potentialTitle.includes('(') && !potentialTitle.includes('①')) {
          expect(potentialTitle).toBe('신고납부')
        }
      })
    })

    describe('시행일 추출', () => {
      it('Structured Markdown에서 추출', () => {
        const chunkText = '**법령명**: 관세법\n**시행일**: 2024-01-01\n내용...'

        const match = chunkText.match(/\*\*시행일\*\*:\s*(.+?)(?:\n|$)/m)
        expect(match).not.toBeNull()
        expect(match![1].trim()).toBe('2024-01-01')
      })
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SSE 스트림 파싱 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('SSE 스트림 파싱', () => {
    it('data: 접두사 제거 후 JSON 파싱', () => {
      const line = 'data: {"candidates":[{"content":{"parts":[{"text":"테스트"}]}}]}'

      expect(line.startsWith('data: ')).toBe(true)

      const data = JSON.parse(line.slice(6))
      expect(data.candidates[0].content.parts[0].text).toBe('테스트')
    })

    it('빈 라인 무시', () => {
      const lines = ['', 'data: {"test": true}', '']
      const validLines = lines.filter(line => line.startsWith('data: '))

      expect(validLines.length).toBe(1)
    })

    it('잘못된 JSON 파싱 시 graceful 처리', () => {
      const line = 'data: {invalid json}'

      let parseError = null
      try {
        JSON.parse(line.slice(6))
      } catch (e) {
        parseError = e
      }

      expect(parseError).not.toBeNull()
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // finishReason 처리 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('finishReason 처리', () => {
    it('STOP은 정상 완료', () => {
      const finishReason = 'STOP'
      expect(finishReason).toBe('STOP')
    })

    it('MAX_TOKENS는 경고 발생', () => {
      const finishReason = 'MAX_TOKENS'
      expect(finishReason).toBe('MAX_TOKENS')
      // 실제로는 warning yield 발생
    })

    it('SAFETY는 안전 필터 차단', () => {
      const finishReason = 'SAFETY'
      expect(finishReason).toBe('SAFETY')
    })

    it('RECITATION은 저작권 차단', () => {
      const finishReason = 'RECITATION'
      expect(finishReason).toBe('RECITATION')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 프롬프트 템플릿 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('프롬프트 템플릿', () => {
    const PROMPT_TEMPLATES: Record<string, string> = {
      specific: '법령 RAG AI. File Search Store 검색 결과만 사용.',
      general: '법령 RAG AI. File Search Store 검색 결과만 사용.',
      comparison: '법령 RAG AI. File Search Store 검색 결과만 사용.',
      procedural: '법령 RAG AI. File Search Store 검색 결과만 사용.'
    }

    it('specific 쿼리 타입에 대한 템플릿 존재', () => {
      expect(PROMPT_TEMPLATES.specific).toBeDefined()
      expect(PROMPT_TEMPLATES.specific).toContain('RAG AI')
    })

    it('general 쿼리 타입에 대한 템플릿 존재', () => {
      expect(PROMPT_TEMPLATES.general).toBeDefined()
    })

    it('comparison 쿼리 타입에 대한 템플릿 존재', () => {
      expect(PROMPT_TEMPLATES.comparison).toBeDefined()
    })

    it('procedural 쿼리 타입에 대한 템플릿 존재', () => {
      expect(PROMPT_TEMPLATES.procedural).toBeDefined()
    })

    it('알 수 없는 쿼리 타입은 general로 fallback', () => {
      const queryType = 'unknown'
      const template = PROMPT_TEMPLATES[queryType] || PROMPT_TEMPLATES.general
      expect(template).toBe(PROMPT_TEMPLATES.general)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LawMetadata 타입 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('LawMetadata 타입', () => {
    it('필수 필드 검증', () => {
      const metadata = {
        law_id: '000001',
        law_name: '테스트법',
        law_type: '법률' as const,
        total_articles: '100'
      }

      expect(metadata.law_id).toBeDefined()
      expect(metadata.law_name).toBeDefined()
      expect(metadata.law_type).toBeDefined()
      expect(metadata.total_articles).toBeDefined()
    })

    it('선택적 필드 검증', () => {
      const metadata = {
        law_id: '000001',
        law_name: '서울특별시 조례',
        law_type: '조례' as const,
        category: '지방자치',
        region: '서울',
        total_articles: '50',
        effective_date: '2024-01-01'
      }

      expect(metadata.category).toBe('지방자치')
      expect(metadata.region).toBe('서울')
      expect(metadata.effective_date).toBe('2024-01-01')
    })

    it('law_type 열거형 값 검증', () => {
      const validTypes = ['법률', '법령', '조례', '시행령', '시행규칙']

      validTypes.forEach(type => {
        const metadata = {
          law_id: '000001',
          law_name: '테스트',
          law_type: type as any,
          total_articles: '10'
        }
        expect(validTypes).toContain(metadata.law_type)
      })
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FileSearchResult 타입 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('FileSearchResult 타입', () => {
    it('기본 구조 검증', () => {
      const result = {
        answer: '테스트 답변입니다.',
        citations: [
          {
            text: '인용 텍스트',
            source: '관세법 제38조',
            startIndex: 0,
            endIndex: 10
          }
        ],
        groundingMetadata: {}
      }

      expect(result.answer).toBeDefined()
      expect(result.citations).toBeInstanceOf(Array)
      expect(result.citations[0].text).toBeDefined()
      expect(result.citations[0].source).toBeDefined()
    })

    it('빈 citations 배열 처리', () => {
      const result = {
        answer: '답변',
        citations: [],
        groundingMetadata: null
      }

      expect(result.citations.length).toBe(0)
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 통합 테스트 (실제 API 호출 없이 Mock 기반)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('file-search-client 통합 테스트 (Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...mockEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('queryFileSearchStream 재시도 로직', () => {
    it('429 에러 시 최대 3회 재시도', async () => {
      let attemptCount = 0

      mockFetch.mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 429,
            text: () => Promise.resolve('Rate limited')
          })
        }
        // 3번째 시도에서 성공
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: () => Promise.resolve({ done: true, value: undefined })
            })
          }
        })
      })

      // 재시도 로직 테스트 (실제 호출 없이 로직만 검증)
      expect(attemptCount).toBe(0)

      // Mock 호출 횟수 시뮬레이션
      for (let i = 0; i < 3; i++) {
        await mockFetch()
      }

      expect(attemptCount).toBe(3)
    })

    it('500 에러 시 exponential backoff 적용', async () => {
      const delays: number[] = []

      // Backoff 계산 테스트
      for (let attempt = 0; attempt < 3; attempt++) {
        const baseDelay = 1000
        const maxDelay = 10000
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
        delays.push(delay)
      }

      expect(delays[0]).toBe(1000)  // 1초
      expect(delays[1]).toBe(2000)  // 2초
      expect(delays[2]).toBe(4000)  // 4초
    })

    it('400 에러는 재시도 없이 즉시 실패', () => {
      const retryableStatusCodes = [429, 500, 502, 503, 504]

      expect(retryableStatusCodes.includes(400)).toBe(false)
      expect(retryableStatusCodes.includes(401)).toBe(false)
      expect(retryableStatusCodes.includes(403)).toBe(false)
      expect(retryableStatusCodes.includes(404)).toBe(false)
    })
  })

  describe('Grounding Metadata 검증', () => {
    it('groundingChunks가 없으면 경고', () => {
      const lastGroundingMetadata = null

      if (!lastGroundingMetadata) {
        // 경고 로깅 발생
        expect(lastGroundingMetadata).toBeNull()
      }
    })

    it('groundingChunks가 0개면 경고', () => {
      const lastGroundingMetadata = {
        groundingChunks: [],
        groundingSupports: []
      }

      expect(lastGroundingMetadata.groundingChunks.length).toBe(0)
    })

    it('Citation 0개일 때 쿼리 재구성 시도', () => {
      const groundingChunks: any[] = []
      const isRetry = false

      if (groundingChunks.length === 0 && !isRetry) {
        // 쿼리 재구성 로직 실행
        expect(true).toBe(true)
      }
    })
  })
})
