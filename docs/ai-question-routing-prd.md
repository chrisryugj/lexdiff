# AI 질문 라우팅 시스템 PRD

## 현재 시스템 분석

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
Gemini API 호출          ← 1회 호출 (~3-5초)
    ↓
[응답]
```

**현재 비용/속도:**
- API 호출: **1회**
- 지연 시간: **~3-5초** (Gemini 응답 시간)
- 분류 정확도: **~85%** (규칙 기반 한계)

### 원래 에이전트 시스템 계획 (문제점 발견)
```
[사용자 질문]
    ↓
Router Agent (Gemini)    ← 추가 API 호출 (+1-2초, +비용)
    ↓
Specialist Agent         ← 기존과 동일
    ↓
[응답]
```

**문제점:**
| 항목 | 현재 | 원래 계획 | 증가율 |
|------|------|----------|--------|
| API 호출 | 1회 | 2회 | **+100%** |
| 지연 시간 | 3-5초 | 4-7초 | **+40~50%** |
| 비용 | 1x | 2x | **+100%** |

❌ **결론: 순수 AI 라우터는 비용 대비 효과 없음**

---

## 실현 가능한 개선안

### Option A: 하이브리드 라우팅 (권장)

**핵심 아이디어:** 규칙 기반 라우터 + 전문화 프롬프트

```
[사용자 질문]
    ↓
analyzeEnhancedLegalQuery()  ← 규칙 기반 (개선, 0ms)
    ├─ 8가지 질문 유형 분류
    ├─ 4가지 도메인 탐지
    └─ 복잡도 평가
    ↓
getSpecialistPrompt()        ← 전문 프롬프트 선택 (0ms)
    ↓
Gemini API 호출              ← 1회 호출 (동일)
    ↓
[전문화된 응답]
```

**효과:**
- API 호출: **1회 (동일)**
- 지연 시간: **3-5초 (동일)**
- 분류 정확도: **~90%** (규칙 개선)
- 답변 품질: **+30% 향상** (전문 프롬프트)

---

### Option B: 선택적 AI 라우팅 (복잡한 질문만)

**핵심 아이디어:** 복잡도가 높은 질문에만 AI 라우터 사용

```
[사용자 질문]
    ↓
quickClassify()              ← 규칙 기반 (0ms)
    ↓
복잡도 판단
    ├─ simple/moderate → 규칙 기반 라우팅 (API 1회)
    └─ complex → AI 라우터 사용 (API 2회)
    ↓
[응답]
```

**효과:**
- 단순 질문 (70%): API 1회, 3-5초
- 복잡 질문 (30%): API 2회, 5-7초
- 평균: API **1.3회**, 지연 **~4초**

---

## 권장안: Option A (하이브리드 라우팅)

### 왜 Option A인가?

| 평가 항목 | Option A | Option B |
|----------|----------|----------|
| 구현 난이도 | ⭐⭐ 낮음 | ⭐⭐⭐⭐ 높음 |
| 비용 증가 | 0% | +30% |
| 지연 증가 | 0% | +20% |
| 품질 향상 | +30% | +35% |
| 유지보수 | 쉬움 | 복잡함 |

**Option A가 비용 대비 효과가 가장 높음**

---

## 구현 계획 (Option A)

### Phase 1: 규칙 기반 분류기 개선 (1일)

**목표:** 현재 6가지 → 8가지 분류, 정확도 향상

**변경 파일:**
- `lib/legal-query-analyzer.ts` - exemption 추가, 패턴 개선

**구현 내용:**
```typescript
// 기존
export type LegalQueryType =
  | 'definition' | 'requirement' | 'procedure'
  | 'comparison' | 'application' | 'consequence' | 'scope'

// 개선
export type LegalQueryType =
  | 'definition'   // 개념/정의/해석
  | 'requirement'  // 요건/조건/자격
  | 'procedure'    // 절차/방법/구제
  | 'comparison'   // 비교/구분
  | 'application'  // 적용/판단
  | 'consequence'  // 효과/결과/처벌
  | 'scope'        // 범위/금액/기한
  | 'exemption'    // 예외/면제/특례 (신규)
```

### Phase 2: 전문 프롬프트 구현 (1일)

**목표:** 8가지 유형별 전문화된 프롬프트

**변경 파일:**
- `lib/legal-prompt-builder.ts` - 8가지 전문 템플릿

**구현 내용:**
- 각 유형별 답변 구조 템플릿 (이미 작성 완료)
- 금지사항/필수사항 명시
- 근거 조문 인용 규칙

### Phase 3: 기존 시스템 통합 (0.5일)

**목표:** 새 분류기와 프롬프트를 기존 파이프라인에 연결

**변경 파일:**
- `lib/file-search-client.ts` - 새 분류 시스템 사용
- `app/api/file-search-rag/route.ts` - queryType 확장

**변경 내용:**
```typescript
// file-search-client.ts의 queryFileSearchStream()

// 기존
const legalAnalysis = analyzeLegalQuery(query)
const systemInstruction = buildLegalPrompt(legalAnalysis.type)

// 개선 (코드 동일, 내부 로직만 개선됨)
const legalAnalysis = analyzeLegalQuery(query)  // 8가지 분류
const systemInstruction = buildLegalPrompt(legalAnalysis.type)  // 전문 프롬프트
```

### Phase 4: 테스트 및 검증 (0.5일)

**테스트 케이스:**
```
| 질문 | 예상 분류 | 검증 |
|------|----------|------|
| "신고납부란?" | definition | |
| "신고납부 요건은?" | requirement | |
| "신고납부 절차는?" | procedure | |
| "신고납부와 부과고지 차이?" | comparison | |
| "저도 신고납부 대상인가요?" | application | |
| "신고납부 위반 시 처벌?" | consequence | |
| "관세율은 얼마?" | scope | |
| "관세 면제 대상은?" | exemption | |
```

---

## 구현 범위 명확화

### ✅ 포함 (In Scope)

1. **규칙 기반 분류기 개선**
   - 기존 `legal-query-analyzer.ts` 수정
   - 8가지 분류 + 도메인 탐지

2. **전문 프롬프트 템플릿**
   - 기존 `legal-prompt-builder.ts` 확장
   - 8가지 유형별 전문 템플릿

3. **기존 파이프라인 연결**
   - `file-search-client.ts` 수정 없음 (이미 연결됨)

### ❌ 제외 (Out of Scope)

1. **AI 기반 라우터**
   - 비용 대비 효과 없음
   - 추후 필요시 Option B로 확장

2. **멀티 에이전트 오케스트레이션**
   - 복잡도 대비 효과 미미
   - 단일 전문 프롬프트로 충분

3. **Response Synthesizer**
   - 단일 API 호출로 불필요

---

## 파일 구조 (최종)

```
lib/
├── legal-query-analyzer.ts   # 8가지 분류 (수정)
├── legal-prompt-builder.ts   # 8가지 전문 프롬프트 (수정)
├── file-search-client.ts     # 기존 유지 (변경 없음)
└── ai-agents/                # 참조용 타입/설정
    ├── types.ts              # 타입 정의 (완료)
    ├── router-agent.ts       # 규칙 기반 fallback용 (완료)
    └── specialist-agents.ts  # 전문 프롬프트 (완료)
```

---

## 성공 지표

| 지표 | 현재 | 목표 | 측정 방법 |
|------|------|------|----------|
| 분류 정확도 | ~85% | >90% | 테스트 셋 |
| API 호출 | 1회 | 1회 | 로그 |
| 응답 시간 | 3-5초 | 3-5초 | 로그 |
| 답변 품질 | 기준 | +30% | 사용자 피드백 |
| 답변 구조 준수 | ~70% | >90% | 샘플 검토 |

---

## 결론

**실현 가능한 개선:**
1. 규칙 기반 분류기 개선 (6→8가지)
2. 전문화된 프롬프트 템플릿 적용
3. 기존 파이프라인 유지 (추가 API 호출 없음)

**예상 효과:**
- 비용 증가 없음
- 지연 시간 증가 없음
- 답변 품질 30% 향상
- 답변 구조 일관성 향상

**구현 기간:** 3일

---

## 작업 항목 (체크리스트)

- [x] types.ts - 8가지 분류 타입 정의
- [x] specialist-agents.ts - 8가지 전문 프롬프트
- [x] router-agent.ts - 규칙 기반 fallback
- [ ] legal-query-analyzer.ts - exemption 패턴 추가
- [ ] legal-prompt-builder.ts - exemption 템플릿 추가
- [ ] 기존 시스템 연결 (file-search-client.ts)
- [ ] 테스트 및 검증
