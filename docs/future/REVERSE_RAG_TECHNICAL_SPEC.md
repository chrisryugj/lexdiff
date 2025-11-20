# 역RAG (Reverse RAG) 기술 명세서

**작성일**: 2025-11-20
**버전**: 1.0
**관련 문서**: [REVERSE_RAG_FEASIBILITY.md](./REVERSE_RAG_FEASIBILITY.md)

---

## 📋 목차

1. [시스템 아키텍처](#시스템-아키텍처)
2. [데이터 플로우](#데이터-플로우)
3. [API 명세](#api-명세)
4. [알고리즘 상세](#알고리즘-상세)
5. [통합 가이드](#통합-가이드)
6. [테스트 계획](#테스트-계획)
7. [성능 최적화](#성능-최적화)
8. [모니터링 및 로깅](#모니터링-및-로깅)

---

## 시스템 아키텍처

### 전체 구조도

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 질문                              │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│            [file-search-rag-view.tsx]                           │
│            사용자 입력 → /api/file-search-rag                    │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│         [/api/file-search-rag] SSE Streaming                    │
│         Gemini 2.5 Flash + File Search                          │
└─────┬───────────────────────────────────────────────────────┬───┘
      ↓                                                       ↓
┌─────────────────┐                               ┌──────────────────┐
│ 답변 생성 성공   │                               │ 답변 생성 실패   │
│ citations >= 1  │                               │ citations == 0  │
└─────┬───────────┘                               └──────┬───────────┘
      ↓                                                  ↓
┌─────────────────┐                               ┌──────────────────┐
│ 정상 답변 표시   │                               │ 역RAG 트리거     │
│                 │                               │ type: 'fallback' │
└─────────────────┘                               └──────┬───────────┘
                                                         ↓
                                            ┌────────────────────────┐
                                            │ 키워드 추출             │
                                            │ extractLawKeywords()   │
                                            └──────┬─────────────────┘
                                                   ↓
                                            ┌────────────────────────┐
                                            │ /api/reverse-rag       │
                                            │ -recommend             │
                                            └──────┬─────────────────┘
                                                   ↓
                                            ┌────────────────────────┐
                                            │ law.go.kr API 검색     │
                                            │ (키워드별 3개씩)        │
                                            └──────┬─────────────────┘
                                                   ↓
                                            ┌────────────────────────┐
                                            │ 추천 리스트 반환        │
                                            │ (최대 10개)            │
                                            └──────┬─────────────────┘
                                                   ↓
                                            ┌────────────────────────┐
                                            │ UI 카드 표시           │
                                            │ 딥링크 연결            │
                                            └────────────────────────┘
```

### 컴포넌트 다이어그램

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React Client)                                      │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │ components/file-search-rag-view.tsx                    │  │
│  │ - handleFileSearchQuery()                              │  │
│  │ - SSE 스트리밍 처리                                     │  │
│  │ - 역RAG 트리거 감지                                     │  │
│  │ - 추천 카드 렌더링                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ lib/reverse-rag-extractor.ts [NEW]                     │  │
│  │ - extractLawKeywords(query): string[]                  │  │
│  │ - 정규식 기반 키워드 추출                               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Backend (Next.js API Routes)                                 │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │ app/api/file-search-rag/route.ts [MODIFIED]            │  │
│  │ - SSE 스트리밍 엔드포인트                               │  │
│  │ - confidenceLevel 계산                                 │  │
│  │ - 역RAG 트리거 플래그 전송                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ app/api/reverse-rag-recommend/route.ts [NEW]           │  │
│  │ - POST: 법령 추천 API                                  │  │
│  │ - 키워드 기반 law.go.kr API 검색                       │  │
│  │ - XML 파싱 및 추천 리스트 반환                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ app/api/law-search/route.ts [EXISTING]                 │  │
│  │ - law.go.kr DRF API 호출                               │  │
│  │ - 법령명 정규화                                         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ External APIs                                                │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │ law.go.kr DRF API                                      │  │
│  │ - lawSearch.do (법령 검색)                             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Google Gemini API                                      │  │
│  │ - File Search (기존)                                   │  │
│  │ - Keyword Extraction (Phase 2)                         │  │
│  │ - Reranking (Phase 3)                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 데이터 플로우

### Phase 1: MVP 데이터 플로우

```typescript
// 1. 사용자 질문 입력
사용자 → "해외 직구 물건 반품하면 관세 환급받을 수 있어?"

// 2. File Search RAG 실행
/api/file-search-rag POST { query: "..." }
  ↓
Gemini 2.5 Flash + File Search
  ↓
SSE Stream:
  data: { type: 'text', text: '...' }
  data: { type: 'citations', citations: [], confidenceLevel: 'low' }
  data: { type: 'reverse_rag_trigger', reason: 'low_confidence' }  // ← 역RAG 트리거
  data: [DONE]

// 3. 클라이언트: 역RAG 트리거 감지
file-search-rag-view.tsx:
  if (parsed.type === 'reverse_rag_trigger') {
    const keywords = extractLawKeywords(currentQuery)
    // → ["관세법", "환급", "자가사용"]
  }

// 4. 추천 API 호출
/api/reverse-rag-recommend POST {
  query: "...",
  keywords: ["관세법", "환급", "자가사용"]
}
  ↓
// 5. law.go.kr API 검색 (각 키워드별)
for (keyword of keywords) {
  lawSearch.do?query={keyword}
    ↓
  XML 응답:
    <law>
      <법령ID>001556</법령ID>
      <법령명한글>관세법</법령명한글>
      <법령구분명>법률</법령구분명>
    </law>
}

// 6. 추천 리스트 생성
{
  success: true,
  recommendations: [
    {
      lawId: "001556",
      lawName: "관세법",
      lawType: "법률",
      keyword: "관세법",
      reason: "\"관세법\" 관련 법령입니다."
    },
    {
      lawId: "001557",
      lawName: "관세법 시행령",
      lawType: "대통령령",
      keyword: "환급",
      reason: "\"환급\" 관련 법령입니다."
    }
  ]
}

// 7. UI 렌더링
file-search-rag-view.tsx:
  setRecommendations(recData.recommendations)
  setShowRecommendations(true)
  ↓
  <div className="reverse-rag-card">
    📜 관세법 [법령 보기]
    📜 관세법 시행령 [법령 보기]
  </div>

// 8. 사용자 클릭
onClick={() => onCitationClick?.("관세법", "")}
  ↓
// 법령 뷰어 오픈 (기존 인프라)
```

---

## API 명세

### 1. 역RAG 추천 API [NEW]

#### Endpoint
```
POST /api/reverse-rag-recommend
```

#### Request Body
```typescript
{
  query: string           // 사용자 질문 (원문)
  keywords?: string[]     // 선택적: 미리 추출된 키워드
  maxResults?: number     // 선택적: 최대 결과 수 (기본값: 10)
}
```

#### Response
```typescript
{
  success: boolean
  recommendations: Array<{
    lawId: string         // 법령 ID (예: "001556")
    lawName: string       // 법령명 (예: "관세법")
    lawType: string       // 법령 구분 (예: "법률", "대통령령")
    keyword: string       // 매칭된 키워드
    reason: string        // 추천 사유 (1줄)
  }>
  keywords: string[]      // 추출된 키워드 목록
  message?: string        // 선택적: 에러 메시지
}
```

#### 에러 응답
```typescript
{
  success: false,
  error: string,
  details?: string
}
```

#### 예시

**Request**:
```bash
curl -X POST http://localhost:3000/api/reverse-rag-recommend \
  -H "Content-Type: application/json" \
  -d '{
    "query": "해외 직구 물건 반품하면 관세 환급받을 수 있어?"
  }'
```

**Response**:
```json
{
  "success": true,
  "recommendations": [
    {
      "lawId": "001556",
      "lawName": "관세법",
      "lawType": "법률",
      "keyword": "관세법",
      "reason": "\"관세법\" 관련 법령입니다."
    },
    {
      "lawId": "001557",
      "lawName": "관세법 시행령",
      "lawType": "대통령령",
      "keyword": "관세법",
      "reason": "\"관세법\" 관련 법령입니다."
    },
    {
      "lawId": "003456",
      "lawName": "수입통관 사무처리에 관한 고시",
      "lawType": "행정규칙",
      "keyword": "환급",
      "reason": "\"환급\" 관련 법령입니다."
    }
  ],
  "keywords": ["관세법", "환급", "자가사용"]
}
```

### 2. File Search RAG API [MODIFIED]

#### 변경사항: SSE 응답에 역RAG 트리거 추가

**기존**:
```
data: { type: 'text', text: '...' }
data: { type: 'citations', citations: [...], confidenceLevel: 'high' }
data: [DONE]
```

**변경 후**:
```
data: { type: 'text', text: '...' }
data: { type: 'citations', citations: [], confidenceLevel: 'low' }
data: { type: 'reverse_rag_trigger', reason: 'low_confidence', citationsCount: 0 }  // ← 추가
data: [DONE]
```

#### 트리거 조건
```typescript
// app/api/file-search-rag/route.ts
if (confidenceLevel === 'low') {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
    type: 'reverse_rag_trigger',
    reason: 'low_confidence',
    citationsCount: citations.length
  })}\n\n`))
}
```

---

## 알고리즘 상세

### 1. 키워드 추출 알고리즘 (Phase 1: 정규식)

```typescript
// lib/reverse-rag-extractor.ts

export function extractLawKeywords(query: string): string[] {
  const keywords = new Set<string>()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 1: 법령명 직접 추출
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const lawPatterns = [
    // 법률: "관세법", "형법", "민법"
    /([가-힣]{2,10}법)\b/g,

    // 대통령령: "시행령", "관세법 시행령"
    /([가-힣]{2,10}령)\b/g,

    // 시행규칙: "시행규칙", "관세법 시행규칙"
    /([가-힣]{2,10}규칙)\b/g,

    // 조례: "서울특별시 조례"
    /([가-힣]{2,10}조례)\b/g,
  ]

  lawPatterns.forEach(pattern => {
    const matches = query.matchAll(pattern)
    for (const match of matches) {
      keywords.add(match[1])
    }
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 2: 도메인 키워드 매핑
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const domainMap: Record<string, string[]> = {
    // 관세/통관
    '관세': ['관세법', '관세법 시행령'],
    '통관': ['관세법', '수입통관 사무처리에 관한 고시'],
    '수입': ['관세법', '대외무역법'],
    '수출': ['관세법', '대외무역법', '수출용원재료에 대한 관세등 환급에 관한 특례법'],
    '환급': ['관세법', '관세법 시행령'],

    // 형사
    '형사': ['형법', '형사소송법'],
    '범죄': ['형법'],
    '고소': ['형사소송법'],
    '피고인': ['형사소송법'],

    // 민사
    '민사': ['민법', '민사소송법'],
    '계약': ['민법'],
    '불법행위': ['민법'],
    '손해배상': ['민법'],

    // 세금
    '세금': ['국세기본법', '소득세법', '법인세법', '부가가치세법'],
    '소득세': ['소득세법'],
    '법인세': ['법인세법'],
    '부가세': ['부가가치세법'],

    // 근로
    '퇴직금': ['근로기준법'],
    '임금': ['근로기준법', '최저임금법'],
    '해고': ['근로기준법'],
    '근로시간': ['근로기준법'],

    // 행정
    '행정처분': ['행정기본법', '행정절차법'],
    '이의신청': ['행정심판법'],
    '취소소송': ['행정소송법'],
  }

  // 도메인 키워드 체크
  Object.entries(domainMap).forEach(([trigger, lawNames]) => {
    if (query.includes(trigger)) {
      lawNames.forEach(name => keywords.add(name))
    }
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 3: 유사어 확장 (선택적)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const synonyms: Record<string, string[]> = {
    '회사': ['상법', '근로기준법'],
    '직장': ['근로기준법'],
    '급여': ['근로기준법', '소득세법'],
  }

  Object.entries(synonyms).forEach(([trigger, lawNames]) => {
    if (query.includes(trigger)) {
      lawNames.forEach(name => keywords.add(name))
    }
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 4: 중복 제거 및 우선순위 정렬
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const result = Array.from(keywords)

  // 우선순위: 직접 매칭 > 도메인 매핑 > 유사어
  // (현재는 Set 순서 그대로)

  return result.slice(0, 5) // 최대 5개
}
```

**테스트 케이스**:
```typescript
extractLawKeywords("해외 직구 물건 반품하면 관세 환급받을 수 있어?")
// → ["관세법", "관세법 시행령"]

extractLawKeywords("회사에서 퇴직금을 안 줘요")
// → ["근로기준법", "상법"]

extractLawKeywords("형법 제250조 살인죄")
// → ["형법"]

extractLawKeywords("소득세 신고는 언제 해야 하나요?")
// → ["소득세법", "국세기본법"]
```

### 2. law.go.kr API 검색 및 파싱

```typescript
// app/api/reverse-rag-recommend/route.ts

async function searchLawByKeyword(keyword: string): Promise<LawSearchResult[]> {
  const LAW_API_BASE = 'https://www.law.go.kr/DRF/lawSearch.do'
  const OC = process.env.LAW_OC

  const params = new URLSearchParams({
    OC,
    type: 'XML',
    target: 'law',
    query: keyword
  })

  const response = await fetch(`${LAW_API_BASE}?${params.toString()}`, {
    next: { revalidate: 3600 } // 1시간 캐싱
  })

  if (!response.ok) {
    throw new Error(`law.go.kr API error: ${response.status}`)
  }

  const xml = await response.text()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // XML 파싱 (정규식 사용)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const results: LawSearchResult[] = []

  // 법령 블록 추출
  const lawBlocks = xml.match(/<law>([\s\S]*?)<\/law>/g) || []

  for (const block of lawBlocks.slice(0, 5)) { // 상위 5개만
    // 법령ID
    const lawIdMatch = block.match(/<법령ID[^>]*>([^<]+)<\/법령ID>/)
    const lawId = lawIdMatch ? lawIdMatch[1] : ''

    // 법령명한글
    const lawNameMatch = block.match(/<법령명한글[^>]*>([^<]+)<\/법령명한글>/)
    const lawName = lawNameMatch ? lawNameMatch[1] : ''

    // 법령구분명
    const lawTypeMatch = block.match(/<법령구분명[^>]*>([^<]+)<\/법령구분명>/)
    const lawType = lawTypeMatch ? lawTypeMatch[1] : ''

    if (lawId && lawName) {
      results.push({
        lawId,
        lawName,
        lawType,
        keyword
      })
    }
  }

  return results
}
```

### 3. 추천 리스트 생성 및 중복 제거

```typescript
// app/api/reverse-rag-recommend/route.ts

interface Recommendation {
  lawId: string
  lawName: string
  lawType: string
  keyword: string
  reason: string
  score?: number // Phase 3: 관련성 점수
}

async function generateRecommendations(
  query: string,
  keywords: string[]
): Promise<Recommendation[]> {

  const allResults: Recommendation[] = []

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 1: 각 키워드로 검색
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  for (const keyword of keywords.slice(0, 3)) { // 최대 3개 키워드
    try {
      const results = await searchLawByKeyword(keyword)

      results.forEach(result => {
        allResults.push({
          ...result,
          reason: `"${keyword}" 관련 법령입니다.`
        })
      })
    } catch (error) {
      console.error(`Failed to search keyword: ${keyword}`, error)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 2: 중복 제거 (lawId 기준)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const uniqueMap = new Map<string, Recommendation>()

  allResults.forEach(rec => {
    if (!uniqueMap.has(rec.lawId)) {
      uniqueMap.set(rec.lawId, rec)
    } else {
      // 같은 법령이 여러 키워드에서 나온 경우, 사유를 병합
      const existing = uniqueMap.get(rec.lawId)!
      existing.reason = `${existing.keyword}, ${rec.keyword} 관련 법령입니다.`
    }
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 3: 우선순위 정렬
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const uniqueResults = Array.from(uniqueMap.values())

  // Phase 1: 검색 API 순서 그대로
  // Phase 3: 관련성 점수로 정렬 (score 내림차순)

  return uniqueResults.slice(0, 10) // 최대 10개
}
```

---

## 통합 가이드

### Step 1: 백엔드 API 추가

#### 1.1 키워드 추출 유틸 생성

```bash
# 파일 생성
touch lib/reverse-rag-extractor.ts
```

```typescript
// lib/reverse-rag-extractor.ts
export function extractLawKeywords(query: string): string[] {
  // (위 알고리즘 참조)
}
```

#### 1.2 추천 API 라우트 생성

```bash
# 파일 생성
mkdir -p app/api/reverse-rag-recommend
touch app/api/reverse-rag-recommend/route.ts
```

```typescript
// app/api/reverse-rag-recommend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { extractLawKeywords } from '@/lib/reverse-rag-extractor'

const LAW_API_BASE = 'https://www.law.go.kr/DRF/lawSearch.do'
const OC = process.env.LAW_OC

export async function POST(request: NextRequest) {
  // (위 API 명세 참조)
}
```

### Step 2: File Search RAG API 수정

```typescript
// app/api/file-search-rag/route.ts

// ✅ 추가: 역RAG 트리거 플래그
if (confidenceLevel === 'low') {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
    type: 'reverse_rag_trigger',
    reason: 'low_confidence',
    citationsCount: citations.length
  })}\n\n`))
}
```

### Step 3: 프론트엔드 UI 통합

#### 3.1 타입 정의 추가

```typescript
// components/file-search-rag-view.tsx

interface Recommendation {
  lawId: string
  lawName: string
  lawType: string
  keyword: string
  reason: string
}
```

#### 3.2 State 추가

```typescript
const [recommendations, setRecommendations] = useState<Recommendation[]>([])
const [showRecommendations, setShowRecommendations] = useState(false)
```

#### 3.3 SSE 처리 로직 수정

```typescript
// SSE 처리 부분
if (parsed.type === 'reverse_rag_trigger') {
  // 키워드 추출
  const keywords = extractLawKeywords(currentQuery)

  // 추천 API 호출
  try {
    const recRes = await fetch('/api/reverse-rag-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: currentQuery, keywords })
    })

    const recData = await recRes.json()

    if (recData.success && recData.recommendations.length > 0) {
      setRecommendations(recData.recommendations)
      setShowRecommendations(true)

      debugLogger.info('역RAG 추천', {
        count: recData.recommendations.length,
        keywords: recData.keywords
      })
    }
  } catch (error) {
    debugLogger.error('역RAG 추천 실패', error)
  }
}
```

#### 3.4 UI 렌더링

```typescript
// 렌더링 부분 (return 문 내)
{showRecommendations && recommendations.length > 0 && (
  <div className="mt-6 p-4 border-2 border-amber-300 rounded-lg bg-amber-50">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-2xl">💡</span>
      <h3 className="text-sm font-semibold text-amber-900">
        다음 법령을 직접 확인해보세요
      </h3>
    </div>

    <p className="text-xs text-amber-700 mb-4">
      ⚠️ AI가 정확한 답변을 찾지 못했습니다. 아래 법령에서 관련 내용을 찾을 수 있습니다.
    </p>

    <div className="space-y-3">
      {recommendations.slice(0, 5).map((rec) => (
        <div
          key={rec.lawId}
          className="p-3 bg-white rounded border border-amber-200 hover:border-amber-400 transition-colors"
        >
          <button
            onClick={() => {
              debugLogger.info('역RAG 추천 클릭', {
                lawName: rec.lawName,
                lawId: rec.lawId
              })
              onCitationClick?.(rec.lawName, '')
            }}
            className="w-full text-left"
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">📜</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">
                  {rec.lawName}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {rec.lawType} · {rec.reason}
                </p>
              </div>
            </div>
          </button>
        </div>
      ))}
    </div>

    <p className="text-xs text-gray-500 mt-4 text-center">
      💬 도움이 되었나요?
      <button className="text-blue-600 hover:underline ml-1">
        피드백 남기기
      </button>
    </p>
  </div>
)}
```

---

## 테스트 계획

### 단위 테스트

#### 1. 키워드 추출 테스트

```typescript
// __tests__/lib/reverse-rag-extractor.test.ts

import { extractLawKeywords } from '@/lib/reverse-rag-extractor'

describe('extractLawKeywords', () => {
  test('관세 관련 질문', () => {
    const keywords = extractLawKeywords('해외 직구 물건 반품하면 관세 환급받을 수 있어?')
    expect(keywords).toContain('관세법')
    expect(keywords.length).toBeGreaterThan(0)
    expect(keywords.length).toBeLessThanOrEqual(5)
  })

  test('퇴직금 관련 질문', () => {
    const keywords = extractLawKeywords('회사에서 퇴직금을 안 줘요')
    expect(keywords).toContain('근로기준법')
  })

  test('형법 직접 언급', () => {
    const keywords = extractLawKeywords('형법 제250조 살인죄')
    expect(keywords).toContain('형법')
  })

  test('키워드 없는 일반 질문', () => {
    const keywords = extractLawKeywords('안녕하세요')
    expect(keywords.length).toBe(0)
  })

  test('중복 키워드 제거', () => {
    const keywords = extractLawKeywords('관세법 관세법 시행령 관세법')
    const unique = new Set(keywords)
    expect(keywords.length).toBe(unique.size)
  })
})
```

#### 2. API 라우트 테스트

```typescript
// __tests__/app/api/reverse-rag-recommend.test.ts

import { POST } from '@/app/api/reverse-rag-recommend/route'
import { NextRequest } from 'next/server'

describe('/api/reverse-rag-recommend', () => {
  test('정상 요청', async () => {
    const request = new NextRequest('http://localhost:3000/api/reverse-rag-recommend', {
      method: 'POST',
      body: JSON.stringify({
        query: '관세 환급은 언제 받나요?',
        keywords: ['관세법', '환급']
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.success).toBe(true)
    expect(data.recommendations).toBeInstanceOf(Array)
    expect(data.recommendations.length).toBeGreaterThan(0)
    expect(data.recommendations[0]).toHaveProperty('lawId')
    expect(data.recommendations[0]).toHaveProperty('lawName')
  })

  test('빈 query', async () => {
    const request = new NextRequest('http://localhost:3000/api/reverse-rag-recommend', {
      method: 'POST',
      body: JSON.stringify({ query: '' })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.success).toBe(true)
    expect(data.recommendations.length).toBe(0)
  })
})
```

### 통합 테스트

```typescript
// __tests__/integration/reverse-rag-flow.test.ts

describe('역RAG 전체 플로우', () => {
  test('File Search 실패 → 역RAG 추천 → 법령 뷰어 오픈', async () => {
    // 1. File Search RAG 호출 (Citation 없음)
    const ragResponse = await fetch('/api/file-search-rag', {
      method: 'POST',
      body: JSON.stringify({ query: '관세 환급' })
    })

    // SSE 스트림 읽기
    const reader = ragResponse.body?.getReader()
    let hasFallbackTrigger = false

    while (true) {
      const { done, value } = await reader!.read()
      if (done) break

      const text = new TextDecoder().decode(value)
      if (text.includes('reverse_rag_trigger')) {
        hasFallbackTrigger = true
      }
    }

    expect(hasFallbackTrigger).toBe(true)

    // 2. 역RAG 추천 API 호출
    const recResponse = await fetch('/api/reverse-rag-recommend', {
      method: 'POST',
      body: JSON.stringify({ query: '관세 환급' })
    })

    const recData = await recResponse.json()
    expect(recData.success).toBe(true)
    expect(recData.recommendations.length).toBeGreaterThan(0)

    // 3. 추천 법령 검증
    const firstRec = recData.recommendations[0]
    expect(firstRec.lawName).toMatch(/관세법/)
  })
})
```

### 성능 테스트

```typescript
// __tests__/performance/reverse-rag-benchmark.test.ts

describe('역RAG 성능 테스트', () => {
  test('키워드 추출 속도', () => {
    const start = performance.now()

    for (let i = 0; i < 1000; i++) {
      extractLawKeywords('관세 환급은 언제 받나요?')
    }

    const end = performance.now()
    const avgTime = (end - start) / 1000

    expect(avgTime).toBeLessThan(1) // 1ms 이내
  })

  test('추천 API 응답 속도', async () => {
    const start = performance.now()

    await fetch('/api/reverse-rag-recommend', {
      method: 'POST',
      body: JSON.stringify({ query: '관세 환급' })
    })

    const end = performance.now()
    const responseTime = end - start

    expect(responseTime).toBeLessThan(3000) // 3초 이내
  })
})
```

---

## 성능 최적화

### 1. 캐싱 전략

#### 1.1 Redis 캐싱 (권장)

```typescript
// lib/reverse-rag-cache.ts
import { createClient } from 'redis'

const redis = createClient({
  url: process.env.REDIS_URL
})

redis.connect()

export async function getCachedRecommendations(
  query: string
): Promise<any[] | null> {
  const key = `reverse-rag:${hashQuery(query)}`
  const cached = await redis.get(key)

  if (cached) {
    debugLogger.info('역RAG 캐시 히트', { query })
    return JSON.parse(cached)
  }

  return null
}

export async function setCachedRecommendations(
  query: string,
  recommendations: any[]
): Promise<void> {
  const key = `reverse-rag:${hashQuery(query)}`
  await redis.set(key, JSON.stringify(recommendations), {
    EX: 86400 // 24시간
  })
}

function hashQuery(query: string): string {
  // 간단한 해시 (crypto 사용 권장)
  return query.toLowerCase().replace(/\s+/g, '')
}
```

#### 1.2 In-Memory 캐싱 (대안)

```typescript
// lib/reverse-rag-cache.ts
const cache = new Map<string, { data: any[]; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24시간

export function getCachedRecommendations(query: string): any[] | null {
  const key = hashQuery(query)
  const cached = cache.get(key)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  cache.delete(key)
  return null
}

export function setCachedRecommendations(query: string, data: any[]): void {
  const key = hashQuery(query)
  cache.set(key, { data, timestamp: Date.now() })

  // 메모리 관리: 1000개 초과 시 오래된 것 제거
  if (cache.size > 1000) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
}
```

### 2. 병렬 처리

```typescript
// app/api/reverse-rag-recommend/route.ts

// ❌ 순차 처리 (느림)
for (const keyword of keywords) {
  const results = await searchLawByKeyword(keyword)
  allResults.push(...results)
}

// ✅ 병렬 처리 (빠름)
const searchPromises = keywords.map(kw => searchLawByKeyword(kw))
const searchResults = await Promise.all(searchPromises)
searchResults.forEach(results => allResults.push(...results))
```

### 3. 요청 디바운싱

```typescript
// components/file-search-rag-view.tsx

import { useDebounce } from '@/hooks/useDebounce'

// 사용자가 연속 클릭 시 마지막 요청만 실행
const debouncedFetchRecommendations = useDebounce(
  async (query: string) => {
    const response = await fetch('/api/reverse-rag-recommend', {
      method: 'POST',
      body: JSON.stringify({ query })
    })
    const data = await response.json()
    setRecommendations(data.recommendations)
  },
  300 // 300ms 디바운스
)
```

---

## 모니터링 및 로깅

### 1. 이벤트 로깅

```typescript
// lib/reverse-rag-logger.ts

export function logReverseRAGTrigger(data: {
  query: string
  confidenceLevel: string
  citationsCount: number
}) {
  debugLogger.info('역RAG 트리거', data)

  // 선택적: 외부 분석 도구 전송
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'reverse_rag_trigger', {
      event_category: 'rag',
      event_label: data.query,
      value: data.citationsCount
    })
  }
}

export function logRecommendationClick(data: {
  lawId: string
  lawName: string
  position: number
}) {
  debugLogger.info('역RAG 추천 클릭', data)

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'reverse_rag_click', {
      event_category: 'rag',
      event_label: data.lawName,
      value: data.position
    })
  }
}
```

### 2. 성공률 추적

```typescript
// lib/reverse-rag-metrics.ts

interface Metrics {
  totalTriggers: number
  totalRecommendations: number
  totalClicks: number
  clickRate: number
}

const metrics: Metrics = {
  totalTriggers: 0,
  totalRecommendations: 0,
  totalClicks: 0,
  clickRate: 0
}

export function trackTrigger() {
  metrics.totalTriggers++
}

export function trackRecommendation(count: number) {
  metrics.totalRecommendations += count
}

export function trackClick() {
  metrics.totalClicks++
  metrics.clickRate = metrics.totalClicks / metrics.totalTriggers
}

export function getMetrics(): Metrics {
  return { ...metrics }
}
```

### 3. 에러 추적

```typescript
// app/api/reverse-rag-recommend/route.ts

try {
  // ... API 로직 ...
} catch (error) {
  // 에러 로깅
  console.error('[Reverse RAG] Error:', error)
  debugLogger.error('역RAG 추천 실패', {
    error: error instanceof Error ? error.message : 'Unknown',
    query,
    keywords
  })

  // 선택적: Sentry 등 에러 추적 서비스 전송
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: {
        feature: 'reverse-rag',
        api: 'recommend'
      },
      extra: { query, keywords }
    })
  }

  return NextResponse.json({
    success: false,
    error: 'Failed to generate recommendations',
    details: error instanceof Error ? error.message : undefined
  }, { status: 500 })
}
```

---

## 다음 단계

### Phase 2 구현 (Gemini 키워드 추출)

**준비 파일**:
- `lib/gemini-keyword-extractor.ts` (새로 생성)
- `app/api/reverse-rag-recommend/route.ts` (수정: Gemini 호출 추가)

**예상 소요 시간**: 1주

### Phase 3 구현 (LLM 리랭크)

**준비 파일**:
- `lib/reverse-rag-reranker.ts` (새로 생성)
- `app/api/reverse-rag-recommend/route.ts` (수정: 리랭크 로직 추가)

**예상 소요 시간**: 1주

---

**문서 버전**: 1.0
**최종 수정일**: 2025-11-20
**관련 문서**: [REVERSE_RAG_FEASIBILITY.md](./REVERSE_RAG_FEASIBILITY.md)
**작성자**: Claude (Anthropic) + LexDiff 개발팀
