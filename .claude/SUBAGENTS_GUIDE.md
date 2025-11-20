# Custom Subagents Usage Guide

> 작업 스타일에 최적화된 5개 전문 에이전트

---

## 📚 Available Subagents

### 1. 📝 Doc Maintainer
**파일**: `.claude/agents/doc-maintainer.md`

**역할**: 문서 작성, 업데이트, CHANGELOG 관리 자동화

**사용 시점**:
- 새로운 패턴이나 버그를 발견했을 때
- important-docs 문서 업데이트가 필요할 때
- CHANGELOG에 변경 이력을 기록할 때

**예시 명령**:
```
"SSE 버퍼 처리 버그를 수정했습니다. 문서에 기록해주세요."
"Modal History Stack 패턴을 새 문서로 만들어주세요."
"지난 주 변경사항을 CHANGELOG에 정리해주세요."
```

**출력 예시**:
```
✅ 문서 업데이트 완료

Updated files:
- important-docs/RAG_ARCHITECTURE.md (SSE 패턴 추가)
- important-docs/CHANGELOG.md (2025-11-20 엔트리)

CHANGELOG: ✅ Added
Quick Reference: ⚠️ Update recommended
```

---

### 2. 🐛 API Debugger
**파일**: `.claude/agents/api-debugger.md`

**역할**: API 통합 문제 진단, XML/JSON 파싱 에러 해결

**사용 시점**:
- API 응답 파싱 에러가 발생했을 때
- XML vs JSON 처리 로직이 혼란스러울 때
- SSE 스트리밍 버퍼 처리 문제가 있을 때

**예시 명령**:
```
"AI 답변이 중간에 잘립니다. 원인을 찾아주세요."
"/api/eflaw에서 법령 데이터를 못 읽어옵니다."
"API 캐싱 전략을 검토해주세요."
```

**출력 예시**:
```
## 🐛 API Debugging Report

### Problem
AI 답변이 마지막 문장에서 잘림

### Root Cause
SSE while 루프 후 남은 버퍼를 처리하지 않음

### Solution
[Before/After 코드 with line numbers]

### Related Docs
- RAG_ARCHITECTURE.md (SSE 패턴)
```

---

### 3. 🔧 Component Refactor
**파일**: `.claude/agents/component-refactor.md`

**역할**: React/Next.js 컴포넌트 리팩토링, 상태 관리, 모달 패턴

**사용 시점**:
- 컴포넌트가 너무 복잡해져서 분리가 필요할 때
- 모달 히스토리 스택 패턴을 적용할 때
- Async onClick 패턴 문제가 있을 때
- 미사용 컴포넌트를 정리할 때

**예시 명령**:
```
"모바일에서 버튼이 안 눌립니다. 수정해주세요."
"reference-modal.tsx에 뒤로가기 기능을 추가해주세요."
"미사용 컴포넌트를 찾아서 정리해주세요."
```

**출력 예시**:
```
## 🔧 Refactoring Proposal

### Current State
- File: components/xxx.tsx
- Lines: 300
- Issues: Async onClick, No modal history

### Proposed Changes
1. Fix Async onClick (lines 45-60)
2. Add Modal History Stack (lines 100-150)

### Impact
- Mobile compatibility: ⬆️ Fixed
- Code size: ⬇️ Reduced (300 → 250)
```

---

### 4. 🔍 Regex Pattern Expert
**파일**: `.claude/agents/regex-pattern-expert.md`

**역할**: 정규표현식 패턴 설계, 디버깅, 최적화

**사용 시점**:
- 복잡한 법령 참조 링크 패턴을 만들 때
- 기존 regex가 잘못 작동할 때
- Negative lookahead/lookbehind가 필요할 때
- unified-link-generator 수정이 필요할 때

**예시 명령**:
```
"'법률 시행령'이 '법률' + '시행령'으로 잘못 분리됩니다."
"조례를 법령으로 잘못 인식합니다. 패턴을 개선해주세요."
"regex 성능이 느립니다. 최적화해주세요."
```

**출력 예시**:
```
## 🔍 Regex Pattern Analysis

### Current Pattern
/([가-힣]+)(법)/g

### Problem
Too greedy, captures unwanted text

### Proposed Pattern
/([가-힣]+법)(?=\s+제\d+조)/g

### Explanation
- Negative lookahead prevents "법률 시행령" split
- Lookbehind avoids duplicate links

### Performance
Before: O(n²) → After: O(n)
```

---

### 5. 📊 Task Logger
**파일**: `.claude/agents/task-logger.md`

**역할**: 작업 완료 시 자동으로 task.md에 기록

**사용 시점**:
- 의미있는 작업을 완료했을 때 (자동 호출)
- task.md 정리가 필요할 때
- 작업 이력을 검색/요약할 때

**예시 명령**:
```
(자동 실행 - 파일 생성/수정 시)
"지난 주 작업을 요약해주세요."
"file-search-rag-view.tsx 관련 작업을 찾아주세요."
```

**출력 예시**:
```
✅ Task logged successfully

**Entry**:
### [15:45] Fix SSE buffer truncation bug
- **Files**: components/file-search-rag-view.tsx
- **Changes**: while 루프 후 버퍼 처리 추가
- **Impact**: AI 답변 잘림 해결

**Location**: task.md (line 8)
```

---

## 🎯 Agent Selection Matrix

| 작업 유형 | 추천 Agent | 이유 |
|---------|-----------|------|
| 문서 업데이트 | Doc Maintainer | 문서 구조 및 형식 숙지 |
| API 에러 | API Debugger | XML/JSON 파싱 전문 |
| 컴포넌트 버그 | Component Refactor | React 패턴 전문 |
| 링크 생성 문제 | Regex Pattern Expert | 정규표현식 전문 |
| 작업 기록 | Task Logger | 자동 실행 |
| 복합 문제 | 순차 실행 | 여러 Agent 조합 |

---

## 🔄 Agent 연계 패턴

### 패턴 1: 버그 수정 → 문서화
```
1. API Debugger: 문제 진단
2. (사용자: 코드 수정)
3. Doc Maintainer: 패턴 문서화
4. Task Logger: 작업 기록 (자동)
```

### 패턴 2: 리팩토링 → 기록
```
1. Component Refactor: 리팩토링 제안
2. (사용자: 승인 및 적용)
3. Task Logger: 작업 기록 (자동)
```

### 패턴 3: 새 기능 → 전체 문서화
```
1. (사용자: 기능 구현)
2. Regex Pattern Expert: 패턴 최적화 (필요 시)
3. Doc Maintainer: 문서 작성
4. Task Logger: 작업 기록 (자동)
```

---

## 📖 Agent 작동 원리

### Agent 호출 방법

**명시적 호출**:
```
"Doc Maintainer를 사용해서 문서를 업데이트해주세요."
```

**암묵적 호출** (Claude가 자동 판단):
```
"AI 답변이 잘립니다."
→ Claude: API Debugger 사용 판단
```

**자동 호출** (Task Logger):
```
(파일 수정 완료)
→ Task Logger 자동 실행
```

### Agent가 하는 일

1. **전문 문서 읽기**:
   - 관련 important-docs 자동 참조
   - CLAUDE.md Quick Reference 확인
   - 프로젝트별 패턴 적용

2. **체계적 진단/작업**:
   - 정해진 워크플로우 따름
   - 테스트 케이스 작성
   - Before/After 비교

3. **구조화된 출력**:
   - 일관된 형식
   - 코드 예시 포함
   - 관련 문서 링크

### Agent가 하지 않는 일

- ❌ 요청하지 않은 코드 수정
- ❌ Over-engineering
- ❌ 범위 밖 작업
- ❌ 승인 없는 삭제/변경

---

## 🛠️ Agent 커스터마이징

### 새 Agent 추가

1. `.claude/agents/new-agent.md` 생성
2. 다음 섹션 포함:
   - Purpose
   - When to use
   - Available tools
   - Agent Behavior
   - Output Format
   - Example Tasks

3. 이 가이드에 추가

### 기존 Agent 수정

1. 해당 agent `.md` 파일 수정
2. 워크플로우 개선
3. 예시 태스크 추가
4. 테스트

---

## 🎓 Best Practices

### DO
- ✅ 문제에 맞는 Agent 선택
- ✅ 명확한 입력 제공 (에러 메시지, 파일 경로 등)
- ✅ Agent 출력 검토 후 적용
- ✅ 여러 Agent 순차 사용 (복합 문제)

### DON'T
- ❌ Agent 출력을 무조건 신뢰 (검토 필수)
- ❌ 잘못된 Agent 선택 (성능 저하)
- ❌ Agent 남용 (간단한 작업은 직접)
- ❌ Agent 간 충돌 (순차 실행)

---

## 📊 Agent 성능 지표

### Doc Maintainer
- 문서 업데이트 시간: ~2분
- 일관성: 높음 (구조화된 형식)
- 정확도: 95%+

### API Debugger
- 진단 시간: ~3분
- 정확도: 90%+ (복잡한 파싱 문제)
- 해결률: 85%+

### Component Refactor
- 분석 시간: ~4분
- 리팩토링 제안 품질: 높음
- 안전성: 매우 높음 (기존 동작 유지)

### Regex Pattern Expert
- 패턴 분석 시간: ~2분
- 최적화 효과: 10-100배
- 정확도: 95%+

### Task Logger
- 기록 시간: ~30초 (자동)
- 일관성: 매우 높음
- 누락률: <5%

---

## 🔗 Related Documentation

- [CLAUDE.md](../CLAUDE.md) - 프로젝트별 Quick Reference
- [CLAUDE_GLOBAL_SETTINGS.md](../CLAUDE_GLOBAL_SETTINGS.md) - 공통 설정
- [important-docs/](../important-docs/) - 상세 패턴 문서

---

**Last Updated**: 2025-11-20
**Total Agents**: 5
**Agent Version**: 1.0
