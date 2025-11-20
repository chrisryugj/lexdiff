# 역RAG (Reverse RAG) 기능 타당성 분석

**작성일**: 2025-11-20
**버전**: 1.0
**상태**: 제안 - 심층 분석 완료

---

## 📋 목차

1. [개념 정의](#개념-정의)
2. [현재 시스템 분석](#현재-시스템-분석)
3. [제안 기능 상세](#제안-기능-상세)
4. [현실성 평가](#현실성-평가)
5. [구현 방안](#구현-방안)
6. [비용 분석](#비용-분석)
7. [리스크 및 제약사항](#리스크-및-제약사항)
8. [결론 및 권장사항](#결론-및-권장사항)

---

## 개념 정의

### 역RAG란?

**기존 RAG (Retrieval Augmented Generation)**:
```
사용자 질문 → 문서 검색 → 답변 생성 → 출처 제공
```

**역RAG (Reverse RAG)**:
```
사용자 질문 → (답변 실패/불충분) → 질문 분석 → 관련 법령 추천 → 사용자 직접 조회
```

### 핵심 차이점

| 구분 | 기존 RAG | 역RAG |
|------|----------|-------|
| **목표** | 정답 제공 | 정답이 있을 법한 위치 안내 |
| **AI 역할** | 답변 생성 | 네비게이션 |
| **사용자 행동** | 답변 읽기 | 원문 직접 확인 |
| **신뢰성** | AI 해석에 의존 | 사용자 직접 판단 |
| **법적 리스크** | 높음 (AI 오해석) | 낮음 (원문 제공) |

---

## 현재 시스템 분석

### 1. Google File Search RAG 구현 현황

#### 아키텍처
```
[사용자 질문]
    ↓
[/api/file-search-rag] SSE Streaming
    ↓
[Gemini 2.5 Flash + File Search]
    ↓
[답변 + Citations] → [신뢰도 레벨 계산]
    ↓
[file-search-rag-view.tsx] → UI 표시
```

#### 핵심 코드 위치
- **API**: `app/api/file-search-rag/route.ts`
- **클라이언트**: `lib/file-search-client.ts`
- **UI**: `components/file-search-rag-view.tsx`

#### 신뢰도 시스템 (이미 구현됨)

**신뢰도 레벨 계산 로직** (`app/api/file-search-rag/route.ts:36`):
```typescript
const confidenceLevel = citations.length >= 3 ? 'high'
                      : citations.length >= 1 ? 'medium'
                      : 'low'
```

**경고 메시지 시스템**:
```typescript
// Citation 없을 때 (route.ts:39-46)
if (citations.length === 0) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
    type: 'warning',
    message: '⚠️ File Search Store에서 관련 조문을 찾지 못했습니다.'
  })}\n\n`))
}

// MAX_TOKENS 경고 (route.ts:49-56)
if (finishReason === 'MAX_TOKENS') {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
    type: 'warning',
    message: '⚠️ 답변이 길어서 중간에 잘렸을 수 있습니다.'
  })}\n\n`))
}
```

**✅ 결론**: **역RAG 트리거 조건이 이미 감지되고 있음**

### 2. 법령 검색 API 인프라

#### 2.1 law.go.kr DRF API

**엔드포인트**: `app/api/law-search/route.ts`

```typescript
const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do"

// 검색 파라미터
{
  OC: process.env.LAW_OC,
  type: "XML",
  target: "law",    // 법률
  query: "관세법"   // 키워드
}
```

**지원 기능**:
- ✅ 키워드 기반 법령 검색
- ✅ 법령명 정규화 (`normalizeLawSearchText`)
- ✅ 별칭 해결 (`resolveLawAlias`)
- ❌ 메타데이터 필터링 (법령 종류, 분야 등)
- ❌ 유사도 점수 제공

#### 2.2 지능형 검색 시스템

**엔드포인트**: `app/api/intelligent-search/route.ts`

```typescript
import { intelligentSearch } from '@/lib/search-strategy'

// 다중 전략 검색
const result = await intelligentSearch(rawQuery)
// → { data, source, pattern, variantUsed }
```

**검색 전략**:
1. 정확한 법령명 매칭
2. 유사 법령명 검색
3. 별칭 해결
4. 조례/행정규칙 분기

### 3. 법령 뷰어 통합

#### 딥링크 시스템

**현재 구현** (`file-search-rag-view.tsx:20-23`):
```typescript
export function FileSearchRAGView({
  onCitationClick?: (lawName: string, articleNum: string) => void
}) {
  // Citation 클릭 시 법령 뷰어 열기
}
```

**연결 가능한 뷰어**:
- `components/law-viewer.tsx`: 법령 전문 뷰어
- `components/reference-modal.tsx`: 조문 모달
- `components/comparison-modal.tsx`: 3단 비교

**✅ 결론**: **추천 법령 클릭 → 뷰어 열기 인프라 존재**

---

## 제안 기능 상세

### 사용자 시나리오

```
사용자: "해외 직구한 물건 반품하면 관세 돌려받을 수 있어?"
    ↓
[File Search RAG 실행]
    ↓
[Citation 0개 발견] → confidenceLevel: 'low'
    ↓
[역RAG 트리거]
    ↓
[키워드 추출]: "관세", "환급", "자가사용", "반품"
    ↓
[law.go.kr API 검색]: "관세법", "관세환급"
    ↓
[추천 리스트 생성]:
  1. 📜 관세법 제106조의2 (자가사용물품 환급)
  2. 📜 관세법 시행령 제188조 (환급 요건)
  3. 📜 수입통관 사무처리에 관한 고시
    ↓
[UI 표시]: "다음 법령을 확인해보세요" 카드
    ↓
[사용자 클릭] → 법령 뷰어 오픈
```

### UI 디자인 (제안)

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ File Search Store에서 정확한 답변을 찾지 못했습니다 │
├─────────────────────────────────────────────────────┤
│ 💡 다음 법령을 직접 확인해보세요                       │
│                                                     │
│ 📜 관세법 제106조의2                                 │
│    └ 자가사용물품 환급 규정                          │
│    [법령 보기]                                      │
│                                                     │
│ 📜 관세법 시행령 제188조                             │
│    └ 환급 요건 및 절차                              │
│    [법령 보기]                                      │
│                                                     │
│ 📜 수입통관 사무처리에 관한 고시                      │
│    └ 자가사용물품 통관 특례                          │
│    [법령 보기]                                      │
└─────────────────────────────────────────────────────┘
```

---

## 현실성 평가

### ✅ 현실적인 요소

#### 1. 트리거 조건 감지 (이미 구현됨)
```typescript
// app/api/file-search-rag/route.ts:36
const confidenceLevel = citations.length >= 3 ? 'high' : 'low'

// ✅ 역RAG 트리거: confidenceLevel === 'low'
```

#### 2. law.go.kr API 활용
```typescript
// app/api/law-search/route.ts
const params = { query: "관세법" }
const response = await fetch(LAW_API_BASE + params)
// ✅ 검색 결과: 관세법, 관세법 시행령, 관세법 시행규칙
```

#### 3. 법령명 정규화 시스템
```typescript
// lib/search-normalizer.ts (추정)
normalizeLawSearchText("관세환급") → "관세법"
resolveLawAlias("행정법") → "행정기본법"
```

#### 4. 딥링크 통합
```typescript
// components/file-search-rag-view.tsx
onCitationClick?.("관세법", "제106조의2")
// ✅ 법령 뷰어 오픈
```

### ❌ 비현실적인 요소

#### 1. 로컬 BM25/FTS 인덱스 구축
**문제점**:
- 전체 법령 크롤링 필요 (수천 개)
- 주기적 업데이트 필요 (법령 개정)
- 인덱스 저장 공간 (수 GB)
- 검색 품질 보장 어려움

**대안**: law.go.kr API 활용 (이미 인덱싱됨)

#### 2. LLM 기반 조문 번호 추론
**문제점**:
```typescript
// ❌ 비효율적
const prompt = "질문: ${q}\n추론: 관련 조문 번호는?"
const response = await gemini.generate(prompt)
// → 비용 발생, 정확도 불확실
```

**대안**: 키워드 매칭 + API 검색

#### 3. 메타데이터 필터링 (law.go.kr API 미지원)
```typescript
// ❌ 불가능
lawSearch({ query: "관세", law_type: "법률", category: "통관" })
```

**대안**: 클라이언트에서 후처리 필터링

### 🟡 조건부 현실적 요소

#### 1. Gemini 키워드 추출
**비용**: 질문당 ~100 토큰 (입력) + 50 토큰 (출력)
**효과**: 정확도 향상 (30% → 70% 추정)

```typescript
const prompt = `다음 질문에서 법령 검색 키워드 3개 추출:
질문: "${userQuery}"
출력: JSON { keywords: string[] }`

const response = await gemini.generate(prompt)
// → { keywords: ["관세법", "환급", "자가사용물품"] }
```

**판단**: **Phase 2 이후 도입** (초기 버전은 정규식)

#### 2. LLM 리랭크
**비용**: 법령당 ~200 토큰
**효과**: 관련성 점수 정렬

```typescript
const prompt = `질문과 법령의 관련성을 0~1로 점수화:
질문: "${userQuery}"
법령: "${lawName} - ${lawTitle}"
출력: { score: number, reason: string }`
```

**판단**: **Phase 3 이후 도입** (초기 버전은 검색 API 순서 그대로)

#### 3. 추천 사유 생성
**비용**: 법령당 ~100 토큰
**효과**: UX 향상

```typescript
const reason = `이 조문이 "${keyword}" 관련 규정입니다.`
```

**판단**: **Phase 2 도입 가능** (간단한 템플릿)

---

## 구현 방안

### Phase 1: MVP (최소 기능 제품)

**목표**: 최소 비용으로 기본 기능 검증

#### 트리거 조건
```typescript
// app/api/file-search-rag/route.ts
if (citations.length === 0) {
  // 역RAG 플래그 전송
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
    type: 'fallback',
    trigger: 'no_citations'
  })}\n\n`))
}
```

#### 키워드 추출 (정규식)
```typescript
// lib/reverse-rag-keywords.ts
export function extractLawKeywords(query: string): string[] {
  const keywords: string[] = []

  // 법령명 패턴
  const lawPatterns = [
    /([가-힣]+법)/g,        // "관세법", "형법"
    /([가-힣]+령)/g,        // "시행령", "대통령령"
    /([가-힣]+규칙)/g,      // "시행규칙"
  ]

  lawPatterns.forEach(pattern => {
    const matches = query.match(pattern)
    if (matches) keywords.push(...matches)
  })

  // 도메인 키워드
  const domainKeywords = [
    '관세', '환급', '통관', '수입', '수출',
    '형사', '민사', '행정', '소송', '상속',
    '부가세', '소득세', '법인세', '세금'
  ]

  domainKeywords.forEach(kw => {
    if (query.includes(kw)) keywords.push(kw)
  })

  return [...new Set(keywords)] // 중복 제거
}
```

#### law.go.kr API 검색
```typescript
// app/api/reverse-rag-recommend/route.ts
export async function POST(request: NextRequest) {
  const { query, keywords } = await request.json()

  const recommendations = []

  for (const keyword of keywords.slice(0, 3)) {
    const searchUrl = `${LAW_API_BASE}?OC=${OC}&query=${keyword}&type=XML`
    const response = await fetch(searchUrl)
    const xml = await response.text()

    // XML 파싱
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const laws = doc.querySelectorAll('law')

    laws.forEach((law, idx) => {
      if (idx < 5) { // 키워드당 상위 5개
        recommendations.push({
          lawId: law.querySelector('법령ID')?.textContent,
          lawName: law.querySelector('법령명한글')?.textContent,
          lawType: law.querySelector('법령구분명')?.textContent,
          // 사유는 템플릿
          reason: `"${keyword}" 관련 법령입니다.`
        })
      }
    })
  }

  return NextResponse.json({
    success: true,
    recommendations: recommendations.slice(0, 10) // 최대 10개
  })
}
```

#### UI 통합
```typescript
// components/file-search-rag-view.tsx
const [recommendations, setRecommendations] = useState<any[]>([])

// SSE 처리 부분에 추가
if (parsed.type === 'fallback') {
  // 역RAG API 호출
  const keywords = extractLawKeywords(currentQuery)
  const recRes = await fetch('/api/reverse-rag-recommend', {
    method: 'POST',
    body: JSON.stringify({ query: currentQuery, keywords })
  })
  const recData = await recRes.json()
  setRecommendations(recData.recommendations)
}

// 렌더링
{recommendations.length > 0 && (
  <div className="mt-4 p-4 border rounded-lg bg-amber-50">
    <h3 className="text-sm font-semibold text-amber-900">
      💡 다음 법령을 확인해보세요
    </h3>
    {recommendations.map(rec => (
      <div key={rec.lawId} className="mt-2">
        <button
          onClick={() => onCitationClick?.(rec.lawName, '')}
          className="text-sm text-blue-600 hover:underline"
        >
          📜 {rec.lawName}
        </button>
        <p className="text-xs text-gray-600">{rec.reason}</p>
      </div>
    ))}
  </div>
)}
```

**예상 결과**:
- 트리거 정확도: **90%** (Citation 없음 감지)
- 키워드 추출 정확도: **60%** (정규식 한계)
- 추천 법령 관련성: **50%** (API 검색 품질)
- 추가 비용: **$0** (law.go.kr API 무료)

---

### Phase 2: 키워드 추출 개선

**목표**: Gemini로 키워드 추출 정확도 향상

#### Gemini 키워드 추출
```typescript
// lib/gemini-keyword-extractor.ts
export async function extractKeywordsWithGemini(query: string): Promise<string[]> {
  const prompt = `다음 법률 질문에서 법령 검색에 필요한 핵심 키워드를 추출하세요.
법령명, 법률 용어, 행위 등을 포함하세요.

질문: "${query}"

출력 형식 (JSON):
{
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "lawNames": ["추정 법령명1", "추정 법령명2"]
}

규칙:
- 최대 5개 키워드
- 법령명은 정확한 공식 명칭 사용 (예: "관세법", "형법")
- 일반 단어보다 법률 용어 우선`

  const result = await gemini.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json'
    }
  })

  const parsed = JSON.parse(result.text)
  return [...parsed.keywords, ...parsed.lawNames]
}
```

**비용 계산**:
- 입력: ~150 토큰
- 출력: ~50 토큰
- 총: 200 토큰/질문
- Gemini 2.0 Flash: $0.075/1M 토큰 (입력)
- 질문당 비용: **$0.000015** (~0.0015센트)

**예상 개선**:
- 키워드 추출 정확도: 60% → **85%**
- 추천 법령 관련성: 50% → **70%**

---

### Phase 3: LLM 리랭크 및 사유 생성

**목표**: 추천 법령을 관련성 순으로 정렬 + 사유 생성

#### 리랭크 + 사유 생성
```typescript
// lib/reverse-rag-reranker.ts
export async function rerankRecommendations(
  query: string,
  candidates: Array<{ lawId: string; lawName: string; lawType: string }>
): Promise<Array<{ lawId: string; lawName: string; reason: string; score: number }>> {

  const prompt = `사용자 질문과 법령의 관련성을 평가하고 점수를 매기세요.

질문: "${query}"

법령 목록:
${candidates.map((c, i) => `${i + 1}. ${c.lawName} (${c.lawType})`).join('\n')}

출력 형식 (JSON):
{
  "rankings": [
    {
      "index": 1,
      "score": 0.95,
      "reason": "이 법령이 질문과 관련된 이유 (1줄)"
    }
  ]
}

규칙:
- score: 0~1 (1이 가장 관련성 높음)
- reason: 1문장, 50자 이내
- 관련 없는 법령은 score < 0.3`

  const result = await gemini.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  })

  const parsed = JSON.parse(result.text)

  return parsed.rankings
    .filter((r: any) => r.score >= 0.3)
    .sort((a: any, b: any) => b.score - a.score)
    .map((r: any) => ({
      ...candidates[r.index - 1],
      reason: r.reason,
      score: r.score
    }))
}
```

**비용 계산**:
- 입력: ~300 토큰 (질문 + 법령 10개)
- 출력: ~200 토큰 (점수 + 사유)
- 총: 500 토큰/요청
- 질문당 비용: **$0.0000375** (~0.00375센트)

**예상 개선**:
- 추천 법령 관련성: 70% → **90%**
- 사용자 클릭률: 30% → **60%**

---

## 비용 분석

### Phase별 비용 비교

| Phase | 키워드 추출 | 리랭크 | 사유 생성 | 총 비용/질문 | 월 비용 (10K 질문) |
|-------|------------|--------|-----------|-------------|-------------------|
| **Phase 1** | 정규식 (무료) | 없음 | 템플릿 | **$0** | **$0** |
| **Phase 2** | Gemini Flash | 없음 | 템플릿 | **$0.000015** | **$0.15** |
| **Phase 3** | Gemini Flash | Gemini Flash | LLM | **$0.000053** | **$0.53** |

### 비용 최적화 전략

#### 1. 캐싱
```typescript
// 동일 키워드 질문 캐싱 (Redis/Vercel KV)
const cacheKey = `reverse-rag:${hashQuery(query)}`
const cached = await redis.get(cacheKey)
if (cached) return JSON.parse(cached)

// 결과 캐싱 (24시간)
await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400)
```

**절감 효과**: 반복 질문 80% → 비용 80% 절감

#### 2. 배치 처리
```typescript
// 여러 법령을 한 번에 리랭크
const prompt = `10개 법령을 한 번에 평가...`
// 단일 API 호출로 비용 절감
```

#### 3. 임계값 설정
```typescript
// 신뢰도가 완전히 낮을 때만 역RAG 실행
if (confidenceLevel === 'low' && citations.length === 0) {
  // 역RAG 실행
}
// medium은 제외 → 비용 50% 절감
```

---

## 리스크 및 제약사항

### 1. 기술적 리스크

#### ❌ law.go.kr API 제약
**문제**:
- 키워드 검색만 지원 (유사도 점수 없음)
- 메타데이터 필터링 미지원
- 검색 품질 불확실 (API 내부 알고리즘)

**완화 방안**:
- 여러 키워드로 다중 검색 후 클라이언트 필터링
- LLM 리랭크로 정확도 보완

#### ❌ 키워드 추출 정확도
**문제**:
- 정규식: 60% 정확도
- Gemini: 85% 정확도 (추정)

**완화 방안**:
- Phase 2에서 Gemini 도입
- 사용자 피드백 학습 (클릭 로그)

### 2. UX 리스크

#### ⚠️ 추천 법령이 관련 없음
**시나리오**:
```
질문: "회사 퇴직금은 언제 받나요?"
추천: [관세법, 형법, 민법] ← 틀림
정답: [근로기준법]
```

**완화 방안**:
- "추천 법령이 정확하지 않을 수 있습니다" 면책 문구
- "도움이 되었나요?" 피드백 수집
- Phase 3 리랭크로 정확도 향상

#### ⚠️ 추천 법령이 너무 많음
**문제**: 10개 추천 → 사용자 혼란

**완화 방안**:
- 상위 3~5개만 표시
- "더보기" 버튼으로 확장

### 3. 법적 리스크

#### ⚠️ AI 추천의 신뢰성
**문제**: 사용자가 추천 법령을 "정답"으로 오해

**완화 방안**:
```
⚠️ 이 법령들은 AI가 추천한 참고 자료입니다.
정확한 법률 자문은 전문가와 상담하세요.
```

---

## 결론 및 권장사항

### ✅ 종합 평가

| 항목 | 평가 | 점수 |
|------|------|------|
| **기술적 실현 가능성** | 높음 (기존 인프라 활용) | ⭐⭐⭐⭐⭐ |
| **비용 효율성** | 매우 높음 (Phase 1 무료) | ⭐⭐⭐⭐⭐ |
| **사용자 가치** | 중상 (답변 실패 시 대안 제공) | ⭐⭐⭐⭐ |
| **구현 복잡도** | 낮음 (기존 코드 활용) | ⭐⭐⭐⭐⭐ |
| **유지보수 부담** | 낮음 (법령 업데이트 자동) | ⭐⭐⭐⭐ |

**총점**: **23/25** (92%)

### 🎯 권장 구현 계획

#### Phase 1: MVP (2주)
- [x] 트리거 조건 구현 (이미 존재)
- [ ] 정규식 키워드 추출
- [ ] law.go.kr API 검색
- [ ] UI 카드 표시
- [ ] 딥링크 연동

**목표**: 기본 기능 검증, 사용자 피드백 수집

#### Phase 2: 키워드 개선 (1주)
- [ ] Gemini 키워드 추출 API
- [ ] 캐싱 시스템 구축
- [ ] A/B 테스트 (정규식 vs Gemini)

**목표**: 정확도 60% → 85%

#### Phase 3: 리랭크 (1주)
- [ ] Gemini 리랭크 API
- [ ] 사유 생성
- [ ] 사용자 피드백 수집

**목표**: 정확도 85% → 90%, 클릭률 60%

### 📊 성공 지표 (KPI)

| 지표 | Phase 1 목표 | Phase 3 목표 |
|------|-------------|-------------|
| **트리거 정확도** | 90% | 95% |
| **추천 법령 관련성** | 50% | 90% |
| **사용자 클릭률** | 30% | 60% |
| **월 비용 (10K 질문)** | $0 | $0.53 |

### 🚀 최종 권장사항

**즉시 시작 가능**: Phase 1 MVP
**이유**:
1. ✅ 기존 인프라 100% 활용 (추가 개발 최소)
2. ✅ 비용 $0 (law.go.kr API 무료)
3. ✅ 사용자 가치 명확 ("답변 없음" → "관련 법령 안내")
4. ✅ 리스크 낮음 (추천 → 사용자 판단)

**다음 단계**: Phase 2 (사용자 피드백 기반)
**조건**: Phase 1에서 클릭률 > 20% 확인 후

**장기 목표**: Phase 3 (정확도 극대화)
**조건**: Phase 2에서 관련성 > 70% 확인 후

---

## 부록: 코드 예시

### A. 트리거 조건 (기존 코드 활용)

```typescript
// app/api/file-search-rag/route.ts (기존 코드)
const confidenceLevel = citations.length >= 3 ? 'high'
                      : citations.length >= 1 ? 'medium'
                      : 'low'

// ✅ 추가: 역RAG 트리거 플래그
if (confidenceLevel === 'low') {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
    type: 'reverse_rag_trigger',
    reason: 'low_confidence',
    citationsCount: citations.length
  })}\n\n`))
}
```

### B. 키워드 추출 (Phase 1)

```typescript
// lib/reverse-rag-extractor.ts
export function extractLawKeywords(query: string): string[] {
  const keywords = new Set<string>()

  // 1. 법령명 패턴
  const lawPatterns = [
    /([가-힣]{2,10}법)\b/g,
    /([가-힣]{2,10}령)\b/g,
    /([가-힣]{2,10}규칙)\b/g,
    /([가-힣]{2,10}조례)\b/g,
  ]

  lawPatterns.forEach(pattern => {
    const matches = query.matchAll(pattern)
    for (const match of matches) {
      keywords.add(match[1])
    }
  })

  // 2. 도메인 키워드 (사전 정의)
  const domainMap = {
    '관세': ['관세법', '수입', '수출', '통관'],
    '형사': ['형법', '형사소송법'],
    '민사': ['민법', '민사소송법'],
    '세금': ['국세기본법', '소득세법', '법인세법'],
    '근로': ['근로기준법', '퇴직금'],
  }

  Object.entries(domainMap).forEach(([key, values]) => {
    if (query.includes(key)) {
      values.forEach(v => keywords.add(v))
    }
  })

  return Array.from(keywords).slice(0, 5) // 최대 5개
}
```

### C. 추천 API (Phase 1)

```typescript
// app/api/reverse-rag-recommend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { extractLawKeywords } from '@/lib/reverse-rag-extractor'

const LAW_API_BASE = 'https://www.law.go.kr/DRF/lawSearch.do'
const OC = process.env.LAW_OC

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    // 키워드 추출
    const keywords = extractLawKeywords(query)

    if (keywords.length === 0) {
      return NextResponse.json({
        success: true,
        recommendations: [],
        message: '관련 키워드를 찾을 수 없습니다.'
      })
    }

    // 각 키워드로 검색
    const recommendations = []

    for (const keyword of keywords.slice(0, 3)) {
      const searchUrl = `${LAW_API_BASE}?OC=${OC}&type=XML&target=law&query=${encodeURIComponent(keyword)}`
      const response = await fetch(searchUrl, {
        next: { revalidate: 3600 }
      })

      const xml = await response.text()

      // XML 파싱 (간단한 정규식)
      const lawIdMatches = xml.matchAll(/<법령ID[^>]*>([^<]+)<\/법령ID>/g)
      const lawNameMatches = xml.matchAll(/<법령명한글[^>]*>([^<]+)<\/법령명한글>/g)
      const lawTypeMatches = xml.matchAll(/<법령구분명[^>]*>([^<]+)<\/법령구분명>/g)

      const lawIds = Array.from(lawIdMatches, m => m[1])
      const lawNames = Array.from(lawNameMatches, m => m[1])
      const lawTypes = Array.from(lawTypeMatches, m => m[1])

      // 상위 3개만
      for (let i = 0; i < Math.min(3, lawIds.length); i++) {
        recommendations.push({
          lawId: lawIds[i],
          lawName: lawNames[i],
          lawType: lawTypes[i],
          keyword,
          reason: `"${keyword}" 관련 법령입니다.`
        })
      }
    }

    // 중복 제거 (lawId 기준)
    const unique = recommendations.filter((rec, idx, self) =>
      self.findIndex(r => r.lawId === rec.lawId) === idx
    )

    return NextResponse.json({
      success: true,
      recommendations: unique.slice(0, 10), // 최대 10개
      keywords
    })
  } catch (error) {
    console.error('Reverse RAG recommend error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
```

### D. UI 통합 (Phase 1)

```typescript
// components/file-search-rag-view.tsx (추가 부분)

interface Recommendation {
  lawId: string
  lawName: string
  lawType: string
  keyword: string
  reason: string
}

export function FileSearchRAGView({ ... }) {
  // 기존 state...
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [showRecommendations, setShowRecommendations] = useState(false)

  // SSE 처리 부분에 추가
  async function handleFileSearchQuery(searchQuery: string) {
    // ... 기존 코드 ...

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const parsed = JSON.parse(line.slice(6))

        // ✅ 역RAG 트리거 감지
        if (parsed.type === 'reverse_rag_trigger') {
          // 추천 API 호출
          const recRes = await fetch('/api/reverse-rag-recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: searchQuery })
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
        }

        // ... 기존 코드 ...
      }
    }
  }

  return (
    <div>
      {/* 기존 UI... */}

      {/* ✅ 역RAG 추천 카드 */}
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
            {recommendations.slice(0, 5).map((rec, idx) => (
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
    </div>
  )
}
```

---

**문서 버전**: 1.0
**최종 수정일**: 2025-11-20
**다음 검토일**: Phase 1 구현 완료 후
**작성자**: Claude (Anthropic) + LexDiff 개발팀
