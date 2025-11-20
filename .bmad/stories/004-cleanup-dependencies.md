# Story 004: Dependencies 정리 및 중복 제거

**우선순위**: P1 (High)
**예상 시간**: 2h
**의존성**: None

## 목표

사용하지 않거나 중복되는 npm 패키지를 제거하여 번들 크기를 줄이고 보안 취약점을 감소시킵니다.

## 현재 상태

**의심되는 중복/미사용 패키지**:
```json
{
  "@google/genai": "^1.29.0",           // ✅ 사용 중
  "@google/generative-ai": "^0.24.1",   // ❌ 중복 가능성
  "ai": "5.0.82"                        // ❌ Vercel AI SDK (미사용?)
}
```

**문제점**:
- Gemini API 패키지가 2개 설치됨 (중복 가능성)
- Vercel AI SDK가 설치되어 있지만 실제 사용하지 않는 것으로 보임
- 번들 크기 불필요하게 증가 (~400KB)

## 완료 조건

- [ ] 각 패키지 사용 여부 확인
- [ ] 미사용 패키지 제거
- [ ] `package.json` 업데이트
- [ ] `package-lock.json` 재생성
- [ ] 빌드 성공
- [ ] 모든 기능 정상 작동

## 구현 가이드

### Step 1: 패키지 사용 여부 조사

#### 1-1. @google/generative-ai 사용 확인

```bash
grep -r "@google/generative-ai" app lib components --include="*.ts" --include="*.tsx"
```

**예상 결과**: 사용 없음 (대신 @google/genai 사용)

#### 1-2. ai (Vercel AI SDK) 사용 확인

```bash
grep -r "from ['\"]ai['\"]" app lib components --include="*.ts" --include="*.tsx"
grep -r "import.*ai/.*" app lib components --include="*.ts" --include="*.tsx"
```

**예상 결과**: 사용 없음

#### 1-3. @google/genai 사용 확인 (유지)

```bash
grep -r "@google/genai" app lib components --include="*.ts" --include="*.tsx"
```

**예상 결과**: `lib/file-search-client.ts`에서 사용 중

```typescript
// lib/file-search-client.ts
import { GoogleGenerativeAI } from '@google/genai'
```

### Step 2: 미사용 패키지 제거

```bash
# @google/generative-ai 제거 (사용 없음 확인 후)
npm uninstall @google/generative-ai

# ai (Vercel AI SDK) 제거 (사용 없음 확인 후)
npm uninstall ai
```

### Step 3: 추가 정리 대상 확인

#### 3-1. cheerio 사용 확인

```bash
grep -r "cheerio" app lib components --include="*.ts" --include="*.tsx"
```

**판단 기준**:
- 사용 중: 유지
- 미사용: 제거 고려

#### 3-2. date-fns 사용 확인

```bash
grep -r "date-fns" app lib components --include="*.ts" --include="*.tsx"
```

**대안**:
- 네이티브 `Intl.DateTimeFormat` 사용 고려
- 사용 빈도 낮으면 제거 고려

### Step 4: 빌드 및 테스트

```bash
# 의존성 재설치
npm install

# 빌드 확인
npm run build

# 개발 서버 실행
npm run dev
```

**테스트 항목**:
- [ ] AI File Search 기능 정상 (Gemini API 사용)
- [ ] AI 요약 기능 정상 (Gemini API 사용)
- [ ] 날짜 표시 정상 (date-fns 사용 시)
- [ ] HTML 파싱 정상 (cheerio 사용 시)

### Step 5: 번들 크기 비교

```bash
# Before 크기 확인 (제거 전)
npm run build
# .next/static/chunks/*.js 크기 확인

# After 크기 확인 (제거 후)
npm run build
# .next/static/chunks/*.js 크기 확인
```

**예상 절감**:
- `@google/generative-ai`: ~200KB
- `ai`: ~150KB
- 총: ~350KB

## 테스트 계획

### 기능 테스트

- [ ] **File Search RAG**: 자연어 질문 → AI 답변
  - 쿼리: "관세법 38조는 무엇인가요?"
  - 예상: 정상 답변 + 인용 조문

- [ ] **AI 요약**: 신·구법 비교 요약
  - 조문 선택 → 비교 → AI 요약 클릭
  - 예상: 정상 요약

- [ ] **날짜 표시**: 법령 시행일 표시
  - 예상: 정상 표시 (YYYY-MM-DD)

- [ ] **HTML 파싱**: law-xml-parser 동작
  - 예상: 정상 파싱

### 성능 테스트

```bash
# Lighthouse 점수 측정
npx lighthouse http://localhost:3000 --only-categories=performance
```

**목표**: Performance 점수 +5점 이상

## 롤백 전략

```bash
# 패키지 재설치
npm install @google/generative-ai@^0.24.1
npm install ai@5.0.82
```

## 주의사항

### ⚠️ 중요: Gemini API 패키지 확인

**현재 프로젝트는 어떤 패키지를 사용하는가?**

1. **@google/genai** (최신):
   - 공식 Google AI SDK
   - File Search, Grounding 지원
   - **권장 패키지**

2. **@google/generative-ai** (구버전):
   - 이전 버전
   - 기능 제한적
   - **제거 대상**

**확인 방법**:
```bash
cat lib/file-search-client.ts | head -10
```

예상 import:
```typescript
import { GoogleGenerativeAI } from '@google/genai'  // ✅ 유지
```

만약:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'  // ❌ 구버전
```

→ 코드 마이그레이션 필요 (별도 스토리)

## 관련 리소스

- `docs/bmad-architect-full-project-analysis.md`: Section 6.3
- `package.json`: 현재 의존성 목록
- CLAUDE.md: Technology Notes

## 예상 효과

- 번들 크기 감소: ~350KB
- npm install 시간 단축
- 보안 취약점 감소
- 의존성 트리 단순화
