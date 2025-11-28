# Superpowers Skills Guide for LexDiff

Claude Code AI 에이전트를 위한 체계적인 개발 워크플로우 스킬 라이브러리입니다.

**Repository**: https://github.com/obra/superpowers

---

## 설치 방법

### Claude Code에서 설치

```bash
# 1. 마켓플레이스 등록
/plugin marketplace add obra/superpowers-marketplace

# 2. 플러그인 설치
/plugin install superpowers@superpowers-marketplace

# 3. 설치 확인
/help
# brainstorm, write-plan, execute-plan 명령어가 보이면 성공
```

### 수동 설치 (플러그인 미지원 환경)

```bash
# 레포지토리 클론
git clone https://github.com/obra/superpowers.git

# skills 폴더의 SKILL.md 파일들을 프로젝트에 복사
```

---

## LexDiff에 유용한 스킬 목록

### 1. Systematic Debugging (체계적 디버깅) ⭐⭐⭐

**용도**: SSE 버퍼 처리, API 파싱 버그 등 복잡한 이슈 디버깅

**핵심 원칙**: "증상 해결이 아닌 근본 원인 파악"

#### 4단계 프로세스

```
Phase 1: 근본 원인 조사
├── 에러 메시지 꼼꼼히 읽기
├── 일관되게 재현 가능한지 확인
├── 최근 변경사항 검토
└── 각 계층에 진단 로그 추가

Phase 2: 패턴 분석
├── 작동하는 유사 코드 찾기
├── 참고 구현과 비교
└── 차이점 식별

Phase 3: 가설과 테스트
├── 명확한 가설 수립
├── 최소한의 변경으로 테스트
└── 과학적 방법론 적용

Phase 4: 구현
├── 실패하는 테스트 케이스 작성
├── 근본 원인만 수정
└── 수정 후 검증
```

#### 중요 규칙

- **3회 시도 실패 시**: 아키텍처 자체를 재검토
- **빨간 깃발**: "나중에 조사하겠다", "한 번 시도해보자" → Phase 1부터 다시 시작

#### LexDiff 적용 예시

```typescript
// SSE 버퍼 잘림 문제 디버깅
// Phase 1: 진단 로그 추가
console.error('[SSE Debug]', {
  bufferLength: buffer.length,
  lastChunk: buffer.slice(-100),
  stack: new Error().stack
})

// Phase 2: 작동하는 패턴과 비교
// file-search-rag-view.tsx:142-172 참조

// Phase 3: 가설 - "while 루프 종료 후 남은 버퍼 미처리"
// Phase 4: 수정 및 검증
```

---

### 2. Root Cause Tracing (근본 원인 추적) ⭐⭐⭐

**용도**: JSON→HTML 파싱 오류, 모달 히스토리 버그 등의 원인 역추적

**핵심 원칙**: "호출 체인을 역추적하여 최초 트리거 발견"

#### 5단계 추적

```
1. 증상 관찰      → 어디서 오류가 발생했는가
2. 직접 원인 파악  → 이 오류를 일으킨 코드는 무엇인가
3. 호출자 추적    → 이 함수를 호출한 것은 무엇인가
4. 데이터 역추적  → 잘못된 값은 어디서 왔는가
5. 원점 발견      → 최초 트리거는 무엇인가
```

#### 계측 추가 방법

```typescript
// 위험한 작업 전에 로깅 추가
console.error('[RootCause]', {
  functionName: 'extractArticleText',
  input: JSON.stringify(lawData).slice(0, 200),
  cwd: process.cwd(),
  stack: new Error().stack
})
```

#### Defense-in-Depth (다층 방어)

근본 원인 수정 후 각 계층에 검증 추가:

```typescript
// Layer 1: 입력값 검증
if (!lawData?.법령?.조문) {
  throw new Error('Invalid law data structure')
}

// Layer 2: 중간 단계 검증
const articles = lawData.법령.조문.조문단위
if (!Array.isArray(articles)) {
  throw new Error('Articles must be array')
}

// Layer 3: 출력 검증
if (!result || result.length === 0) {
  console.warn('Empty result from extractArticleText')
}
```

---

### 3. Verification Before Completion (완료 전 검증) ⭐⭐⭐

**용도**: 법령 데이터 정확성이 필수인 LexDiff에 필수적

**핵심 원칙**: "증거 없이 완료 선언 금지"

#### 검증 프로세스

```
1. 명령 파악  → 주장을 증명하는 명령이 무엇인가?
2. 실행      → 완전한 명령을 직접 실행
3. 읽기      → 전체 출력과 종료 코드 확인
4. 검증      → 출력이 주장을 뒷받침하는가?
5. 선언      → 증거와 함께만 완료 주장
```

#### 피해야 할 표현

```
❌ "작동할 것 같다"
❌ "아마도 완료된 것 같습니다"
❌ "완료!" (검증 전)
❌ 부분 검증만으로 만족
❌ 과거 실행 결과에만 의존
```

#### LexDiff 적용 예시

```bash
# 빌드 검증
npm run build
# → 출력에서 에러/경고 확인

# 린트 검증
npm run lint
# → 0 errors, 0 warnings 확인

# 기능 검증
# → 브라우저에서 실제 동작 확인 후 완료 선언
```

---

### 4. Test-Driven Development (테스트 주도 개발) ⭐⭐

**용도**: 안정적인 코드 작성, 회귀 방지

**핵심 원칙**: "실패하는 테스트 없이 프로덕션 코드 작성 금지"

#### Red-Green-Refactor 사이클

```
RED (빨강)
├── 기능이 없어서 실패하는 테스트 작성
├── 명확한 이름으로 한 가지 동작만 검증
└── 실패하는 것을 직접 확인

GREEN (초록)
├── 테스트를 통과시키는 최소한의 코드 구현
├── 과잉 엔지니어링 금지
└── 테스트 범위 밖의 기능 추가 금지

REFACTOR (리팩터)
├── 테스트 통과 유지하며 코드 정리
├── 중복 제거
└── 이름 개선, 헬퍼 추출
```

#### 절대 규칙

코드를 먼저 작성했다면 **모두 삭제하고 처음부터 시작**

#### LexDiff 적용 예시

```typescript
// 1. RED: 실패하는 테스트 작성
test('buildJO converts 제38조 to 003800', () => {
  expect(buildJO('제38조')).toBe('003800')
})

// 2. GREEN: 최소 구현
function buildJO(joLabel: string): string {
  const match = joLabel.match(/제(\d+)조/)
  if (!match) return ''
  return match[1].padStart(4, '0') + '00'
}

// 3. REFACTOR: 개선
function buildJO(joLabel: string): string {
  const match = joLabel.match(/제(\d+)조(?:의(\d+))?/)
  if (!match) return ''
  const main = match[1].padStart(4, '0')
  const sub = (match[2] || '0').padStart(2, '0')
  return main + sub
}
```

---

### 5. Defense-in-Depth (다층 방어) ⭐⭐

**용도**: API 에러, 외부 법령 로드 실패 등 예외 처리

**핵심 원칙**: "여러 계층에서 검증하여 버그를 불가능하게 만들기"

#### 4계층 방어 전략

```typescript
// Layer 1: 환경 검증
if (!process.env.LAW_OC) {
  throw new Error('LAW_OC environment variable required')
}

// Layer 2: 입력 검증
function fetchLaw(lawName: string) {
  if (!lawName || typeof lawName !== 'string') {
    throw new Error('Invalid law name')
  }
}

// Layer 3: API 응답 검증
const response = await fetch(url)
if (!response.ok) {
  throw new Error(`API error: ${response.status}`)
}

// Layer 4: 데이터 구조 검증
const data = await response.json()
if (!data?.법령?.기본정보) {
  throw new Error('Invalid API response structure')
}
```

---

### 6. Writing Plans / Executing Plans (계획 작성/실행) ⭐⭐

**용도**: 복잡한 기능(3단 비교, 통합 링크 시스템) 개발

**핵심 원칙**: "2-5분 단위의 작은 작업으로 분해"

#### 계획 작성 형식

```markdown
## 기능: [기능명]

### 목표
[한 문장으로 명확하게]

### 작업 분해
1. [ ] 작업1 (2-5분) - 구체적 설명
2. [ ] 작업2 (2-5분) - 구체적 설명
3. [ ] 작업3 (2-5분) - 구체적 설명

### 검증 방법
- [ ] 테스트 통과
- [ ] 빌드 성공
- [ ] 기능 동작 확인
```

#### LexDiff 적용 예시

```markdown
## 기능: 모달 히스토리 스택 구현

### 목표
모달 내에서 다른 법령 링크 클릭 시 뒤로가기 지원

### 작업 분해
1. [ ] modalHistory 상태 추가 (3분)
2. [ ] 링크 클릭 시 히스토리 push 로직 (5분)
3. [ ] 뒤로가기 버튼 UI 추가 (3분)
4. [ ] handleBack 함수 구현 (5분)
5. [ ] 테스트 및 검증 (5분)

### 검증 방법
- [ ] 모달에서 링크 3번 클릭 후 뒤로가기 3번 동작 확인
- [ ] 빌드 에러 없음
```

---

### 7. Brainstorming (브레인스토밍) ⭐

**용도**: 새 기능 설계 시 요구사항 정제

**핵심 원칙**: "소크라테스식 질문으로 설계 정제"

#### 브레인스토밍 프로세스

```
1. 초기 아이디어 제시
2. 질문을 통한 명확화
   - "이 기능의 핵심 목표는?"
   - "사용자가 기대하는 결과는?"
   - "엣지 케이스는?"
3. 섹션별 구조화
4. 우선순위 결정
5. 최종 설계 확정
```

---

## 스킬 조합 활용법

### 버그 수정 워크플로우

```
1. Systematic Debugging (Phase 1-2)
   ↓
2. Root Cause Tracing (5단계 추적)
   ↓
3. Test-Driven Development (실패 테스트 작성)
   ↓
4. Defense-in-Depth (다층 방어 추가)
   ↓
5. Verification Before Completion (검증 후 완료)
```

### 새 기능 개발 워크플로우

```
1. Brainstorming (요구사항 정제)
   ↓
2. Writing Plans (작업 분해)
   ↓
3. Test-Driven Development (TDD 사이클)
   ↓
4. Executing Plans (단계별 실행)
   ↓
5. Verification Before Completion (검증 후 완료)
```

---

## Quick Reference Card

| 스킬 | 핵심 원칙 | 적용 시점 |
|------|----------|----------|
| Systematic Debugging | 근본 원인 파악 우선 | 버그 발생 시 |
| Root Cause Tracing | 콜체인 역추적 | 원인 불명확 시 |
| Verification Before Completion | 증거 없이 완료 금지 | 모든 작업 완료 전 |
| Test-Driven Development | 테스트 먼저 | 새 코드 작성 시 |
| Defense-in-Depth | 다층 검증 | 외부 의존성 처리 시 |
| Writing/Executing Plans | 2-5분 단위 분해 | 복잡한 기능 개발 시 |
| Brainstorming | 소크라테스식 질문 | 새 기능 설계 시 |

---

## 참고 링크

- **GitHub**: https://github.com/obra/superpowers
- **Skills 디렉토리**: https://github.com/obra/superpowers/tree/main/skills
- **라이선스**: MIT

---

**Last Updated**: 2025-11-28
