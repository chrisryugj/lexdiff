# agent.md - 에이전트 활용 가이드

**목적**: Claude Code에서 전문 에이전트를 효과적으로 활용하기 위한 가이드

---

## 🤖 에이전트 활용 원칙

### 언제 에이전트를 사용하는가?

**에이전트 사용이 권장되는 경우**:
- ✅ 복잡한 다단계 작업 (5+ 단계)
- ✅ 코드베이스 전반에 걸친 탐색이 필요한 경우
- ✅ 여러 파일/디렉토리에 걸친 패턴 분석
- ✅ 반복적인 검색 및 필터링 작업
- ✅ 문서 생성/유지보수 (CHANGELOG, README 등)

**에이전트 사용이 불필요한 경우**:
- ❌ 단일 파일 수정
- ❌ 명확한 경로의 파일 읽기
- ❌ 간단한 버그 수정 (1-2파일)
- ❌ UI 컴포넌트 스타일링

---

## 📋 사용 가능한 에이전트 타입

### 1. Explore (코드베이스 탐색)
**사용 시점**:
- "X 기능은 어디에 구현되어 있나요?"
- "Y 패턴을 사용하는 파일들을 찾아주세요"
- "관련 API 엔드포인트는 어떻게 작동하나요?"

**Thoroughness 레벨**:
- `quick`: 빠른 검색 (키워드 매칭)
- `medium`: 중간 수준 탐색 (여러 위치 확인)
- `very thorough`: 포괄적 분석 (전체 코드베이스)

**예시**:
```typescript
// 사용자 요청: "법령 파싱 로직이 어디 있는지 찾아줘"
Task tool (subagent_type=Explore, thoroughness=medium)
→ lib/law-xml-parser.tsx, lib/law-parser.ts 등 발견
```

### 2. Plan (작업 계획 수립)
**사용 시점**:
- 복잡한 기능 구현 전 계획 수립
- 여러 파일에 걸친 리팩토링
- 아키텍처 변경 검토

**예시**:
```typescript
// 사용자 요청: "검색 기능에 필터링 추가하는 방법 계획해줘"
Task tool (subagent_type=Plan)
→ 1. 기존 검색 로직 분석
→ 2. 필터 UI 컴포넌트 설계
→ 3. API 수정 계획
→ 4. 상태 관리 전략
```

### 3. general-purpose (범용 작업)
**사용 시점**:
- 복잡한 다단계 구현
- 여러 도구를 조합한 작업
- 탐색 → 분석 → 수정이 필요한 경우

**예시**:
```typescript
// 사용자 요청: "모든 API 라우트에 에러 핸들링 추가"
Task tool (subagent_type=general-purpose)
→ 1. API 라우트 파일 탐색
→ 2. 현재 에러 핸들링 패턴 분석
→ 3. 통합 에러 핸들러 작성
→ 4. 각 라우트에 적용
```

---

## 🎯 프로젝트별 에이전트 패턴

### LexDiff 프로젝트 특화 패턴

#### 1. 법령 파싱 관련 작업
**트리거 키워드**: "파싱", "XML", "JSON 변환", "법령 데이터"
**추천 에이전트**: `Explore` (medium)
**참조 문서**: `important-docs/JSON_TO_HTML_FLOW.md`

**워크플로우**:
```
1. Explore 에이전트로 관련 파일 찾기
2. JSON_TO_HTML_FLOW.md 읽기
3. 패턴 확인 후 작업 진행
```

#### 2. API 통합 디버깅
**트리거 키워드**: "API 에러", "응답 파싱", "law.go.kr"
**추천 에이전트**: `Explore` (quick) → 직접 수정
**참조 문서**: `important-docs/DEBUGGING_GUIDE.md`

**워크플로우**:
```
1. 에러 발생 API 라우트 확인
2. DEBUGGING_GUIDE.md에서 유사 패턴 검색
3. 직접 수정 (에이전트 불필요)
```

#### 3. RAG 시스템 작업
**트리거 키워드**: "AI 검색", "Gemini", "File Search", "SSE"
**추천 에이전트**: `Explore` (very thorough)
**참조 문서**: `important-docs/RAG_ARCHITECTURE.md`

**워크플로우**:
```
1. Explore 에이전트로 RAG 관련 파일 전체 분석
2. RAG_ARCHITECTURE.md 읽기
3. SSE 버퍼 처리 패턴 확인
4. 작업 진행
```

#### 4. UI 컴포넌트 리팩토링
**트리거 키워드**: "컴포넌트 분리", "파일 크기", "리팩토링"
**추천 에이전트**: `Plan` → `general-purpose`
**참조**: CLAUDE.md 파일 크기 제한 섹션

**워크플로우**:
```
1. Plan 에이전트로 분리 전략 수립
2. 사용자 승인 받기
3. general-purpose 에이전트로 실행
```

---

## 🔄 에이전트 워크플로우 예시

### 예시 1: 새로운 기능 추가
**요청**: "법령 비교 기능에 히스토리 추가해줘"

**단계**:
1. **요구사항 명확화**:
   ```markdown
   ## 확인이 필요한 사항

   ### 1. [높은 우선순위] 히스토리 저장 위치
   **질문**: 히스토리를 로컬스토리지에 저장하시나요, 아니면 DB에?
   **추천 안**: 로컬스토리지 (현재 favorites와 동일 패턴)
   **이유**: DB 없이 빠른 구현 가능, 일관된 패턴

   ### 2. [중간 우선순위] 히스토리 개수 제한
   **질문**: 최대 몇 개의 비교 히스토리를 보관하시나요?
   **추천 안**: 최근 20개
   **이유**: 성능과 UX 균형
   ```

2. **사용자 답변 확인**:
   - 로컬스토리지 사용 확인
   - 20개 제한 동의

3. **에이전트 활용**:
   ```typescript
   // Step 1: Explore로 현재 비교 기능 분석
   Task tool (subagent_type=Explore, thoroughness=medium)
   Prompt: "법령 비교 기능이 어떻게 구현되어 있는지 찾아주세요"

   // Step 2: favorites 패턴 확인 (참조용)
   Read: lib/favorites-store.ts

   // Step 3: 직접 구현
   - lib/comparison-history-store.ts 생성
   - 비교 컴포넌트에 히스토리 저장 로직 추가
   ```

### 예시 2: 버그 수정
**요청**: "AI 답변이 중간에 잘리는 문제 수정해줘"

**단계**:
1. **문서 우선 확인**:
   ```typescript
   Read: important-docs/RAG_ARCHITECTURE.md
   // SSE 버퍼 처리 섹션 확인
   ```

2. **문제 패턴 확인**:
   - "자주 발생하는 실수" 섹션 확인
   - SSE 버퍼 처리 누락 패턴 발견

3. **직접 수정** (에이전트 불필요):
   ```typescript
   // file-search-rag-view.tsx에 버퍼 처리 로직 추가
   if (buffer.trim()) {
     // 남은 버퍼 처리
   }
   ```

### 예시 3: 문서 업데이트
**요청**: "새로운 파싱 버그 패턴을 문서에 추가해줘"

**단계**:
1. **직접 업데이트** (에이전트 불필요):
   ```typescript
   Edit: important-docs/JSON_TO_HTML_FLOW.md
   // "자주 발생하는 실수" 섹션에 추가

   Edit: important-docs/CHANGELOG.md
   // 오늘 날짜로 변경 이력 추가
   ```

---

## 📊 에이전트 선택 플로우차트

```
사용자 요청 받음
    ↓
요구사항이 명확한가?
    ├─ No → 질문 리스트 + 추천 안 작성
    │         ↓
    │      사용자 답변 대기
    │         ↓
    └─ Yes
        ↓
작업 복잡도 평가
    ├─ 단순 (1-2파일) → 직접 수정
    │     ↓
    │  관련 문서 읽기
    │     ↓
    │  Edit/Write 도구 사용
    │
    ├─ 중간 (3-5파일, 탐색 필요)
    │     ↓
    │  Explore 에이전트 (quick/medium)
    │     ↓
    │  결과 확인 후 직접 수정
    │
    └─ 복잡 (5+파일, 다단계)
          ↓
      Plan 에이전트로 계획 수립
          ↓
      사용자 승인
          ↓
      general-purpose 에이전트 실행
```

---

## ⚠️ 에이전트 사용 시 주의사항

### DO
- ✅ 에이전트 프롬프트를 명확하고 구체적으로 작성
- ✅ Thoroughness 레벨을 작업에 맞게 설정
- ✅ 에이전트 결과를 검토 후 사용자에게 요약 전달
- ✅ 필요시 에이전트를 순차적으로 연결 (Plan → Explore → general-purpose)

### DON'T
- ❌ 단순 작업에 에이전트 남용
- ❌ 에이전트 결과를 맹목적으로 신뢰
- ❌ 여러 에이전트를 불필요하게 병렬 실행
- ❌ 에이전트 프롬프트에 모호한 지시

---

## 🔧 에이전트 프롬프트 작성 Best Practices

### 좋은 프롬프트 예시

```typescript
// ✅ 구체적이고 명확한 프롬프트
Task tool (
  subagent_type=Explore,
  thoroughness=medium,
  prompt: "Find all files that implement law article parsing logic,
           specifically focusing on XML to JSON conversion patterns
           used in lib/ directory. Look for functions that handle
           법령 조문 구조."
)

// ✅ 컨텍스트와 목표가 명확
Task tool (
  subagent_type=Plan,
  prompt: "Plan how to add a history feature to the law comparison view.
           Current implementation uses local storage for favorites
           (lib/favorites-store.ts). The history should:
           1. Store last 20 comparisons
           2. Include timestamp and law names
           3. Allow quick restore of previous comparisons"
)
```

### 나쁜 프롬프트 예시

```typescript
// ❌ 너무 모호함
Task tool (
  subagent_type=Explore,
  prompt: "파싱 관련 코드 찾아줘"
)

// ❌ 목표가 불명확
Task tool (
  subagent_type=Plan,
  prompt: "비교 기능 개선해줘"
)
```

---

## 📈 에이전트 활용 성공 패턴

### 패턴 1: 탐색 → 분석 → 실행
```
1. Explore (medium): 관련 파일/패턴 찾기
2. Read: 찾은 파일 읽고 분석
3. 직접 수정: Edit/Write 도구 사용
```
**사용 사례**: API 엔드포인트 추가, 기존 기능 확장

### 패턴 2: 계획 → 승인 → 자동화
```
1. Plan: 리팩토링/기능 추가 계획 수립
2. 사용자 승인 받기
3. general-purpose: 자동 실행
```
**사용 사례**: 대규모 리팩토링, 새 기능 추가

### 패턴 3: 문서 기반 작업
```
1. Read: important-docs 확인
2. 패턴 발견 시 직접 적용
3. 새 패턴 발견 시 문서 업데이트
```
**사용 사례**: 버그 수정, 패턴 적용

---

## 🎓 학습 가이드

### 초보자를 위한 에이전트 활용

**1주차**: 직접 도구만 사용
- Read, Edit, Write, Grep, Glob 익히기
- 문서 읽기 습관 형성

**2주차**: Explore 에이전트 도입
- 코드베이스 탐색 시 사용
- quick → medium 레벨로 점진적 활용

**3주차**: Plan 에이전트 활용
- 복잡한 작업 전 계획 수립
- 사용자 피드백 받기

**4주차**: general-purpose 에이전트
- 다단계 작업 자동화
- 에이전트 조합 활용

---

## 📚 관련 문서

- `CLAUDE.md`: 프로젝트 전반적인 작업 지침
- `important-docs/`: 구현 패턴 상세 문서
- `.claude/CLAUDE.md`: 전역 작업 원칙

---

**Last Updated**: 2025-11-25
**Version**: 1.0
**Author**: LexDiff Project
