# Story 005: LawAPIClient 통합 클래스 생성

**우선순위**: P1 (High)
**예상 시간**: 8h
**의존성**: Story 001-004 (Phase 1 완료)

## 목표

44개 API 라우트에서 반복되는 로직을 `lib/api/law-api-client.ts`로 통합하여 중복 코드를 제거하고 타입 안전성을 향상시킵니다.

## 현재 상태

**문제점**:
- 44개 API 라우트에서 동일한 패턴 반복 (~500줄 중복)
- 환경변수 체크 44회 반복
- 에러 처리 로직 44회 반복
- 캐싱 설정 44회 반복
- XML vs JSON 응답 처리 불일치

**반복되는 코드 예시**:
```typescript
// 모든 API 라우트에서 반복
const OC = process.env.LAW_OC || ""
if (!OC) {
  debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
  return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
}

const response = await fetch(url, {
  next: { revalidate: 3600 },
})

if (!response.ok) {
  debugLogger.error("API 오류", { status: response.status })
  throw new Error(`API 응답 오류: ${response.status}`)
}
```

## 완료 조건

- [ ] `lib/api/law-api-client.ts` 생성
- [ ] `lib/api/types.ts` 생성 (타입 정의)
- [ ] `lib/api/errors.ts` 생성 (커스텀 에러)
- [ ] 단위 테스트 작성 (선택)
- [ ] 최소 2개 API 라우트에서 사용 검증
- [ ] 빌드 성공

## 구현 가이드

### Step 1: 디렉토리 구조 생성

```bash
mkdir -p lib/api
```

### Step 2: 커스텀 에러 클래스 생성

**파일**: `lib/api/errors.ts`

```typescript
export class LawAPIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public context?: Record<string, any>
  ) {
    super(message)
    this.name = 'LawAPIError'
  }
}

export class LawAPIValidationError extends LawAPIError {
  constructor(message: string, context?: Record<string, any>) {
    super(400, message, context)
    this.name = 'LawAPIValidationError'
  }
}

export class LawAPINotFoundError extends LawAPIError {
  constructor(message: string, context?: Record<string, any>) {
    super(404, message, context)
    this.name = 'LawAPINotFoundError'
  }
}
```

### Step 3: 타입 정의

**파일**: `lib/api/types.ts`

```typescript
export type ResponseFormat = 'xml' | 'json'

export interface LawAPIClientOptions {
  apiKey?: string
  baseURL?: string
  defaultRevalidate?: number
}

export interface FetchOptions {
  responseFormat?: ResponseFormat
  revalidate?: number
  cache?: RequestCache
}

// Law Search
export interface LawSearchParams {
  query: string
  display?: number
  target?: 'law' | 'admrul' | 'expc'
}

// Eflaw
export interface EflawParams {
  lawId?: string
  mst?: string
  efYd?: string  // 시행일 (YYYYMMDD)
  jo?: string    // 조문 (6-digit JO code)
}

// Old/New Comparison
export interface OldNewParams {
  lawId?: string
  mst?: string
  joNo: string   // 조문번호
  newYd?: string // 신법 시행일
  oldYd?: string // 구법 시행일
}

// Three-Tier
export interface ThreeTierParams {
  lawId?: string
  mst?: string
  knd: '1' | '2'  // 1=인용, 2=위임
}

// Hierarchy
export interface HierarchyParams {
  lawName: string
}

// Admin Rule
export interface AdminRuleParams {
  id?: string
  serialNumber?: string
}
```

### Step 4: LawAPIClient 클래스 생성

**파일**: `lib/api/law-api-client.ts`

```typescript
import { debugLogger } from '@/lib/debug-logger'
import { LawAPIError, LawAPIValidationError } from './errors'
import type {
  LawAPIClientOptions,
  FetchOptions,
  LawSearchParams,
  EflawParams,
  OldNewParams,
  ThreeTierParams,
  HierarchyParams,
  AdminRuleParams,
  ResponseFormat
} from './types'

export class LawAPIClient {
  private readonly baseURL: string
  private readonly apiKey: string
  private readonly defaultRevalidate: number

  constructor(options?: LawAPIClientOptions) {
    this.baseURL = options?.baseURL || "https://www.law.go.kr/DRF"
    this.apiKey = options?.apiKey || process.env.LAW_OC || ""
    this.defaultRevalidate = options?.defaultRevalidate || 3600

    if (!this.apiKey) {
      throw new LawAPIValidationError("LAW_OC environment variable is required")
    }
  }

  /**
   * 공통 fetch 메서드
   */
  private async fetch<T = string>(
    endpoint: string,
    params: Record<string, string>,
    options?: FetchOptions
  ): Promise<T> {
    const {
      responseFormat = 'xml',
      revalidate = this.defaultRevalidate,
      cache = 'default'
    } = options || {}

    // URLSearchParams 생성
    const queryParams = new URLSearchParams({
      OC: this.apiKey,
      type: responseFormat === 'xml' ? 'XML' : 'JSON',
      ...params
    })

    const url = `${this.baseURL}/${endpoint}?${queryParams}`

    debugLogger.info(`[LawAPIClient] ${endpoint}`, { params })

    try {
      const response = await fetch(url, {
        next: { revalidate },
        cache
      })

      if (!response.ok) {
        throw new LawAPIError(
          response.status,
          `${endpoint} failed`,
          { url, status: response.status }
        )
      }

      const text = await response.text()

      // HTML 에러 페이지 감지
      if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
        debugLogger.error(`[LawAPIClient] HTML error page received`, { endpoint })
        throw new LawAPIError(500, "Received HTML error page from API", { endpoint })
      }

      if (responseFormat === 'xml') {
        return text as T
      } else {
        return JSON.parse(text) as T
      }

    } catch (error) {
      if (error instanceof LawAPIError) {
        throw error
      }
      debugLogger.error(`[LawAPIClient] ${endpoint} 실패`, error)
      throw new LawAPIError(500, `${endpoint} request failed`, { error })
    }
  }

  /**
   * 법령 검색
   */
  async searchLaw(params: LawSearchParams): Promise<string> {
    const { query, display = 100, target = 'law' } = params

    if (!query || query.trim().length === 0) {
      throw new LawAPIValidationError("query is required")
    }

    return this.fetch('lawSearch.do', {
      target,
      query: query.trim(),
      display: display.toString()
    }, { responseFormat: 'xml' })
  }

  /**
   * 법령 전문 조회 (eflaw)
   */
  async getEflaw<T = any>(params: EflawParams): Promise<T> {
    const { lawId, mst, efYd, jo } = params

    if (!lawId && !mst) {
      throw new LawAPIValidationError("lawId or mst is required")
    }

    const apiParams: Record<string, string> = {
      target: 'eflaw',
      ...(lawId && { ID: lawId }),
      ...(mst && { MST: mst }),
      ...(efYd && { efYd }),
      ...(jo && { JO: jo })
    }

    return this.fetch('lawService.do', apiParams, { responseFormat: 'json' })
  }

  /**
   * 신·구법 대조 (oldnew)
   */
  async getOldNew(params: OldNewParams): Promise<string> {
    const { lawId, mst, joNo, newYd, oldYd } = params

    if (!lawId && !mst) {
      throw new LawAPIValidationError("lawId or mst is required")
    }

    if (!joNo) {
      throw new LawAPIValidationError("joNo is required")
    }

    const apiParams: Record<string, string> = {
      ...(lawId && { ID: lawId }),
      ...(mst && { MST: mst }),
      joNo,
      ...(newYd && { newYd }),
      ...(oldYd && { oldYd })
    }

    return this.fetch('lawService.do', apiParams, { responseFormat: 'xml' })
  }

  /**
   * 3단 비교 (law-decree-rule)
   */
  async getThreeTier<T = any>(params: ThreeTierParams): Promise<T> {
    const { lawId, mst, knd } = params

    if (!lawId && !mst) {
      throw new LawAPIValidationError("lawId or mst is required")
    }

    const apiParams: Record<string, string> = {
      target: 'law',
      ...(lawId && { ID: lawId }),
      ...(mst && { MST: mst }),
      knd
    }

    return this.fetch('lawService.do', apiParams, { responseFormat: 'json' })
  }

  /**
   * 법령 계층 (hierarchy)
   */
  async getHierarchy(params: HierarchyParams): Promise<string> {
    const { lawName } = params

    if (!lawName || lawName.trim().length === 0) {
      throw new LawAPIValidationError("lawName is required")
    }

    return this.fetch('lawService.do', {
      target: 'law',
      lawName: lawName.trim()
    }, { responseFormat: 'xml' })
  }

  /**
   * 행정규칙 조회
   */
  async getAdminRule(params: AdminRuleParams): Promise<string> {
    const { id, serialNumber } = params

    if (!id && !serialNumber) {
      throw new LawAPIValidationError("id or serialNumber is required")
    }

    const apiParams: Record<string, string> = {
      target: 'admrul',
      ...(id && { ID: id }),
      ...(serialNumber && { serialNumber })
    }

    return this.fetch('lawService.do', apiParams, { responseFormat: 'xml' })
  }

  /**
   * 조례 검색
   */
  async searchOrdinance(params: LawSearchParams): Promise<string> {
    const { query, display = 100 } = params

    if (!query || query.trim().length === 0) {
      throw new LawAPIValidationError("query is required")
    }

    return this.fetch('lawSearch.do', {
      target: 'ordin',
      query: query.trim(),
      display: display.toString()
    }, { responseFormat: 'xml' })
  }

  /**
   * 조례 전문 조회
   */
  async getOrdinance<T = any>(params: { ordinSeq?: string; ordinId?: string }): Promise<T> {
    const { ordinSeq, ordinId } = params

    if (!ordinSeq && !ordinId) {
      throw new LawAPIValidationError("ordinSeq or ordinId is required")
    }

    const apiParams: Record<string, string> = {
      target: 'ordin',
      ...(ordinSeq && { ordinSeq }),
      ...(ordinId && { ordinId })
    }

    return this.fetch('lawService.do', apiParams, { responseFormat: 'json' })
  }
}

// Singleton instance
let clientInstance: LawAPIClient | null = null

export function getLawAPIClient(): LawAPIClient {
  if (!clientInstance) {
    clientInstance = new LawAPIClient()
  }
  return clientInstance
}
```

### Step 5: 기존 API 라우트 리팩토링 예시

**Before**: `app/api/law-search/route.ts`

```typescript
export async function GET(request: Request) {
  const OC = process.env.LAW_OC || ""
  if (!OC) {
    return NextResponse.json({ error: "API 키가 없습니다" }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")

  if (!query) {
    return NextResponse.json({ error: "검색어가 필요합니다" }, { status: 400 })
  }

  try {
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=law&type=XML&query=${encodeURIComponent(query)}`
    const response = await fetch(url, { next: { revalidate: 3600 } })

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const xml = await response.text()
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
      }
    })
  } catch (error) {
    debugLogger.error("법령 검색 실패", error)
    return NextResponse.json({ error: "검색 실패" }, { status: 500 })
  }
}
```

**After**: `app/api/law-search/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getLawAPIClient } from '@/lib/api/law-api-client'
import { LawAPIError, LawAPIValidationError } from '@/lib/api/errors'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")

  if (!query) {
    return NextResponse.json({ error: "검색어가 필요합니다" }, { status: 400 })
  }

  try {
    const client = getLawAPIClient()
    const xml = await client.searchLaw({ query })

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
      }
    })
  } catch (error) {
    if (error instanceof LawAPIValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof LawAPIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json({ error: "검색 실패" }, { status: 500 })
  }
}
```

**절감**: ~40줄 → ~25줄 (15줄 절감)

## 테스트 계획

### 단위 테스트 (선택)

**파일**: `lib/api/__tests__/law-api-client.test.ts`

```typescript
import { LawAPIClient } from '../law-api-client'
import { LawAPIValidationError } from '../errors'

describe('LawAPIClient', () => {
  it('should throw error when API key is missing', () => {
    expect(() => new LawAPIClient({ apiKey: '' })).toThrow(LawAPIValidationError)
  })

  it('should validate searchLaw params', async () => {
    const client = new LawAPIClient({ apiKey: 'test' })
    await expect(client.searchLaw({ query: '' })).rejects.toThrow(LawAPIValidationError)
  })

  // ... 더 많은 테스트
})
```

### 통합 테스트

- [ ] `/api/law-search?query=관세법` → 200 OK, XML 응답
- [ ] `/api/eflaw?lawId=001234` → 200 OK, JSON 응답
- [ ] `/api/oldnew?lawId=001234&joNo=003800` → 200 OK, XML 응답
- [ ] 잘못된 파라미터 → 400 Bad Request
- [ ] API 키 없음 → 500 Internal Server Error

## 롤백 전략

```bash
# LawAPIClient 제거
rm -rf lib/api

# 기존 API 라우트 복구
git checkout HEAD -- app/api/law-search/route.ts
```

## 관련 리소스

- CLAUDE.md: API Response Parsing (XML vs JSON)
- `docs/bmad-architect-full-project-analysis.md`: Section 3
- 기존 API 라우트: `app/api/*/route.ts`

## 예상 효과

- 중복 코드 제거: ~500줄
- 타입 안전성 향상
- 에러 처리 일관성
- 테스트 용이성 증가
- API 변경 시 한 곳만 수정

## 다음 단계

Story 006-010: 44개 API 라우트를 LawAPIClient로 마이그레이션
