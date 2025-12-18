# AI 질문 라우팅 시스템 PRD v2

> **업데이트**: 2025-12-18
> **변경사항**: 2-Tier API 구조 추가, Gemini 3.0 Flash 분석

---

## 1. 현재 시스템 분석

### 현재 흐름
```
[사용자 질문]
    ↓
preprocessQuery()        ← 규칙 기반 (0ms)
    ↓
analyzeLegalQuery()      ← 규칙 기반 (0ms)
    ↓
buildLegalPrompt()       ← 템플릿 선택 (0ms)
    ↓
Gemini 2.5 Flash + RAG   ← 1회 호출 (~3-5초)
    ↓
[응답]
```

**현재 비용/속도:**
- API 호출: **1회**
- 지연 시간: **~3-5초**
- 분류 정확도: **~85%** (규칙 기반 한계)
- 모델: **Gemini 2.5 Flash** ($0.30/$2.50 per 1M tokens)

---

## 2. Gemini 모델 현황 (2025-12-18 기준)

### 가격 비교표

| 모델 | Input/1M | Output/1M | 무료 티어 | File Search | 비고 |
|------|----------|-----------|----------|-------------|------|
| **2.5 Flash Lite** | $0.10 | $0.40 | ✅ 500 RPD | ❓ 미확인 | 최저가, Router용 |
| **2.5 Flash** | $0.30 | $2.50 | ✅ 제한적 | ✅ 지원 | 현재 RAG용 |
| **3.0 Flash** | $0.50 | $3.00 | ✅ 제한적 | ❓ 미확인 | 12/17 출시 |
| **2.5 Pro** | $1.25 | $10.00 | ❌ 제거됨 | ✅ 지원 | 고품질 |

> **출처**: [Google AI Pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini 3 Flash 발표](https://blog.google/products/gemini/gemini-3-flash/)

### Gemini 3.0 Flash 분석

**출시일**: 2025-12-17 ([TechCrunch](https://techcrunch.com/2025/12/17/google-launches-gemini-3-flash-makes-it-the-default-model-in-the-gemini-app/))

**성능 향상:**
- 2.5 Pro 대비 **3배 빠름** ([VentureBeat](https://venturebeat.com/technology/gemini-3-flash-arrives-with-reduced-costs-and-latency-a-powerful-combo-for))
- SWE-bench: **78%** (2.5 시리즈 및 3.0 Pro 초과)
- Thinking 태스크: 토큰 **30% 절감**

**File Search 지원 여부:**
- ⚠️ **현재 미확인** - 공식 문서에 2.5 모델만 언급
- File Search는 `gemini-2.5-pro`, `gemini-2.5-flash` 지원 확인 ([Google Blog](https://blog.google/technology/developers/file-search-gemini-api/))
- 3.0 Flash 지원은 추후 확인 필요

**결론**: RAG용으로는 당분간 **2.5 Flash 유지** 권장

---

## 3. 개선안 비교

### Option A: 규칙 기반 개선 (보수적)

```
[질문] → 규칙 분류 (0ms) → 2.5 Flash + RAG → [응답]
```

| 항목 | 값 |
|------|-----|
| API 호출 | 1회 |
| 추가 비용 | $0 |
| 지연 증가 | 0초 |
| 분류 정확도 | ~90% |
| 품질 향상 | +30% (프롬프트) |

### Option B: 2-Tier AI 라우팅 (권장) ⭐

```
[질문]
    ↓
2.5 Flash Lite (무료)    ← Router: 분류만 (~0.5초)
    ↓ { queryType, domain, complexity, subQuestions }
    ↓
2.5 Flash + RAG          ← 전문 프롬프트 (~3-5초)
    ↓
[응답]
```

| 항목 | 값 |
|------|-----|
| API 호출 | 2회 |
| 추가 비용 | **$0** (무료 티어) 또는 **~$0.0001/요청** |
| 지연 증가 | **+0.5~1초** |
| 분류 정확도 | **~95%** (+10%) |
| 품질 향상 | **+40%** (AI 분류 + 전문 프롬프트) |

### Option C: 3.0 Flash 업그레이드 (향후)

```
[질문] → 2.5 Flash Lite → 3.0 Flash + RAG → [응답]
```

| 항목 | 현재 (2.5) | 3.0 업그레이드 | 변화 |
|------|-----------|---------------|------|
| 비용/요청 | ~$0.003 | ~$0.004 | +33% |
| 응답 속도 | 3-5초 | 1-2초 | **-60%** |
| 품질 | 기준 | +20~30% | 향상 |

⚠️ **전제조건**: 3.0 Flash의 File Search 지원 확인 필요

---

## 4. 권장안: Option B (2-Tier AI 라우팅)

### 왜 Option B인가?

| 평가 항목 | Option A | **Option B** | Option C |
|----------|----------|--------------|----------|
| 구현 난이도 | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 추가 비용 | $0 | **$0** (무료) | +33% |
| 지연 증가 | 0초 | +0.5초 | -2초 |
| 분류 정확도 | 90% | **95%** | 95% |
| 복합질문 처리 | ❌ | **✅** | ✅ |
| 리스크 | 없음 | 낮음 | File Search 미확인 |

**Option B가 비용 $0으로 가장 높은 품질 향상**

### 2-Tier 구조 상세

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Router (Gemini 2.5 Flash Lite)                    │
│  ───────────────────────────────────────                    │
│  • 모델: gemini-2.5-flash-lite                              │
│  • 비용: 무료 (500 RPD) 또는 $0.10/$0.40 per 1M            │
│  • 응답시간: ~0.3-0.5초                                     │
│  • 출력: JSON { queryType, domain, complexity, ... }        │
│  • 토큰: ~100 input, ~200 output                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   RouterAnalysis 전달
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: RAG (Gemini 2.5 Flash + File Search)              │
│  ───────────────────────────────────────                    │
│  • 모델: gemini-2.5-flash                                   │
│  • 비용: $0.30/$2.50 per 1M                                 │
│  • 응답시간: ~3-5초                                         │
│  • 입력: 전문 프롬프트 (queryType 기반)                     │
│  • 도구: File Search Store                                  │
└─────────────────────────────────────────────────────────────┘
```

### 비용 상세 분석

**Router 호출당 비용:**
```
Input: ~100 tokens = $0.10 × 100 / 1,000,000 = $0.00001
Output: ~200 tokens = $0.40 × 200 / 1,000,000 = $0.00008
───────────────────────────────────────────────────────
Total: $0.00009/요청 (약 $0.009/100요청)
```

**일일 100회 기준:**
- 무료 티어 (500 RPD) 내: **$0**
- 유료 전환 시: **$0.009/일** (월 $0.27)

---

## 5. 구현 계획

### Phase 1: 규칙 기반 분류기 개선 (0.5일)

**파일**: `lib/legal-query-analyzer.ts`

```typescript
// exemption 추가
export type LegalQueryType =
  | 'definition' | 'requirement' | 'procedure' | 'comparison'
  | 'application' | 'consequence' | 'scope'
  | 'exemption'  // 신규: 예외/면제/특례
```

### Phase 2: 전문 프롬프트 확장 (0.5일)

**파일**: `lib/legal-prompt-builder.ts`

- exemption 템플릿 추가
- 기존 7개 템플릿 검증

### Phase 3: AI Router 구현 (1일)

**파일**: `lib/ai-agents/router-agent.ts` (이미 작성됨)

```typescript
// analyzeQuery() 함수 활용
const routerResult = await analyzeQuery(query)
// → { primaryType, domain, complexity, subQuestions, ... }
```

**신규 파일**: `lib/ai-question-router.ts`

```typescript
export async function routeQuestion(query: string): Promise<{
  analysis: RouterAnalysis
  specialistPrompt: string
}> {
  // 1. AI Router 호출 (2.5 Flash Lite)
  const analysis = await analyzeQuery(query)

  // 2. 전문 프롬프트 선택
  const prompt = getSpecialistPrompt(analysis.primaryType)

  return { analysis, prompt }
}
```

### Phase 4: 기존 시스템 통합 (0.5일)

**파일**: `lib/file-search-client.ts`

```typescript
// 기존
const legalAnalysis = analyzeLegalQuery(query)  // 규칙 기반

// 개선
const { analysis, specialistPrompt } = await routeQuestion(query)  // AI 기반
```

### Phase 5: 테스트 및 검증 (0.5일)

**테스트 케이스:**
```
| 질문 | 예상 분류 | AI 분류 | 일치 |
|------|----------|---------|------|
| "신고납부란?" | definition | | |
| "관세 면제 대상은?" | exemption | | |
| "A와 B 차이? 절차는?" | comparison + procedure | | |
```

---

## 6. 파일 구조

```
lib/
├── legal-query-analyzer.ts   # 규칙 기반 분류 (fallback)
├── legal-prompt-builder.ts   # 8가지 전문 프롬프트
├── file-search-client.ts     # RAG 클라이언트 (수정)
├── ai-question-router.ts     # 메인 라우터 (신규)
└── ai-agents/
    ├── types.ts              # 타입 정의 ✅
    ├── router-agent.ts       # AI Router ✅
    └── specialist-agents.ts  # 전문 프롬프트 ✅
```

---

## 7. 성공 지표

| 지표 | 현재 | 목표 | 측정 |
|------|------|------|------|
| 분류 정확도 | ~85% | **>95%** | 테스트 셋 100건 |
| 복합질문 처리 | 불가 | **가능** | subQuestions 생성 |
| API 호출 | 1회 | 2회 | 로그 |
| 추가 비용 | - | **$0** | 무료 티어 |
| 응답 시간 | 3-5초 | 4-6초 | 로그 |
| 답변 품질 | 기준 | **+40%** | A/B 테스트 |

---

## 8. 향후 계획 (3.0 Flash)

### 모니터링 항목
1. Gemini 3.0 Flash의 File Search 지원 발표
2. 가격 변동 (Context Caching 90% 할인 적용 시)
3. 성능 벤치마크 (법률 도메인)

### 업그레이드 조건
- [ ] 3.0 Flash File Search 지원 확인
- [ ] 비용 효율성 검증 (Context Caching 포함)
- [ ] 법률 도메인 품질 테스트

### 예상 효과 (3.0 업그레이드 시)
```
현재: 2.5 Lite → 2.5 Flash + RAG (4-6초)
향후: 2.5 Lite → 3.0 Flash + RAG (2-3초, 품질 +20%)
```

---

## 9. 작업 체크리스트

### 완료
- [x] `lib/ai-agents/types.ts` - 8가지 분류 타입
- [x] `lib/ai-agents/specialist-agents.ts` - 8가지 전문 프롬프트
- [x] `lib/ai-agents/router-agent.ts` - AI Router

### 진행 예정
- [ ] `lib/legal-query-analyzer.ts` - exemption 패턴 추가
- [ ] `lib/legal-prompt-builder.ts` - exemption 템플릿 추가
- [ ] `lib/ai-question-router.ts` - 메인 라우터 (신규)
- [ ] `lib/file-search-client.ts` - 2-Tier 구조 통합
- [ ] 테스트 및 검증

---

## 10. 참고 자료

- [Gemini 3 Flash 발표](https://blog.google/products/gemini/gemini-3-flash/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [File Search Tool 소개](https://blog.google/technology/developers/file-search-gemini-api/)
- [Gemini 2.5 Flash Lite GA](https://developers.googleblog.com/en/gemini-25-flash-lite-is-now-stable-and-generally-available/)
