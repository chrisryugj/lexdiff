# CLAUDE.md 전역 설정 템플릿

**목적**: 프로젝트 공통 적용 가능한 Claude Code 작업 원칙 (간결 버전)

---

## 🤖 핵심 작업 원칙

### 컨텍스트 관리
- 컨텍스트 윈도우는 자동으로 압축됨 - 계속 작업 진행
- 토큰 예산 걱정으로 **절대** 작업을 조기 종료하거나 중단하지 말 것

### 문서 우선 접근
**모든 코드 변경 전**:
1. CLAUDE.md 읽기 (Quick Reference)
2. 관련 상세 문서 읽기
3. 실제 코드 파일 읽기
4. 변경 진행

**원칙**: 파일을 읽지 않고 변경 제안 금지

---

## 📝 자동 작업 기록

### Task Logger 에이전트 (자동 트리거)
**중요**: 의미있는 작업 완료 후 `task.md`에 자동 기록

**자동 트리거 조건**:
- ✅ 파일 생성/수정/삭제
- ✅ 버그 수정
- ✅ 새 기능
- ✅ 리팩토링
- ✅ 설정 변경

**기록 생략 조건**:
- ❌ 파일 읽기만 한 경우
- ❌ 질문 답변만 한 경우
- ❌ 정보 조회만 한 경우

### 기록 형식
```markdown
## YYYY-MM-DD
### [HH:MM KST] 작업 제목
- **Files**: `file1.ts` (created/modified/deleted)
- **Changes**:
  - 구체적 변경 1
  - 구체적 변경 2
- **Impact**: 누구/무엇에 영향
- **Reason**: 이유 (선택)
```

### 기록 워크플로우
1. **Read** `task.md`
2. **확인** 오늘 날짜 섹션 존재 여부
3. **추가** 날짜 섹션 최상단에 새 엔트리
4. **Edit** `task.md` 변경사항 반영

### 시간대 설정
- **항상 서울 표준시(KST, UTC+9) 사용**
- 시간 표기: `[HH:MM KST]` 형식
- 예시: `[15:30 KST]`, `[09:00 KST]`

### 통합
- `task.md`: 모든 작업 (자동, 상세 로그)
- `CHANGELOG.md`: 중요한 변경만 (수동, 팀 공유용)
- CLAUDE.md는 참조 허브로만 유지

---

## 💻 코딩 원칙

### 과도한 엔지니어링 방지
**원칙**: 명시적으로 요청된 것만 구현

**해야 할 것**:
- ✅ 버그만 수정 / 요청된 기능만 추가
- ✅ 솔루션을 단순하게 유지
- ✅ 시스템 경계에서만 검증

**하지 말아야 할 것**:
- ❌ 요청되지 않은 기능/리팩토링 추가
- ❌ 변경하지 않은 코드에 문서/타입 추가
- ❌ 발생 불가능한 시나리오 에러 처리
- ❌ 일회성 작업용 헬퍼 생성
- ❌ 하위 호환성 핵

### 보안 체크리스트
- Command Injection, XSS, SQL Injection, Path Traversal
- **불안전한 코드 작성 시 즉시 수정**

---

## 🛠️ 도구 사용

### 병렬 도구 호출
**효율성 극대화**: 독립적인 도구는 같은 메시지에서 호출

### 전용 도구 우선 사용
**파일 작업**: Read, Edit, Write, Glob, Grep (bash 금지)
**Bash**: 시스템 명령만 (git, npm, docker)
**소통**: 직접 텍스트 (bash echo 금지)

### 전문 에이전트 자동 사용
**중요**: 작업 유형에 따라 전문 에이전트를 자동으로 제안/사용

**프로젝트에 `.claude/agents/` 디렉토리가 있으면**:
- 각 작업에 맞는 전문 에이전트 자동 식별
- Task 도구로 해당 에이전트 실행
- 에이전트 설명(description)을 보고 작업 매칭

**일반적인 에이전트 패턴**:
- `doc-maintainer`: 문서 작성/업데이트 시
- `api-debugger`: API 통합 문제 디버깅 시
- `component-refactor`: React 컴포넌트 리팩토링 시
- `regex-pattern-expert`: 정규표현식 작업 시
- `task-logger`: 작업 완료 후 자동 기록 (자동 트리거)

**에이전트 사용 예시**:
```
작업: "API 응답 파싱 에러 디버깅"
→ Task tool (subagent_type=api-debugger) 자동 사용

작업: "CHANGELOG.md 업데이트"
→ Task tool (subagent_type=doc-maintainer) 자동 사용
```

### 코드베이스 탐색
넓은 질문("X는 어디?", "Y는 어떻게 작동?"):
- ✅ Task 도구 (subagent_type=Explore)
- ❌ 수동 Glob + Grep + Read 체인

---

## 📐 코드 참조

### 표준 형식
- 파일: `file_path:line_number`
- 범위: `file_path:start-end`

### VSCode (해당 시)
마크다운 링크 사용: `[file.ts:42](src/file.ts#L42)`
**백틱이나 `<code>` 태그 사용 금지**

---

## 🚀 Git 워크플로우

### 안전 프로토콜
**절대 금지**: config 수정, 파괴적 명령, hook 스킵, main/master force push, 사용자 요청 없는 커밋

### 커밋 플로우
1. 병렬 실행: `git status`, `git diff`, `git log -5`
2. 메시지 작성 (why > what, 1-2문장)
3. HEREDOC + co-author 푸터로 커밋

### PR 플로우
1. 병렬 실행: `git status`, `git diff`, `git log`, `git diff main...HEAD`
2. 모든 커밋 분석 (최신만 아니라)
3. `gh pr create` + 요약 + 테스트 계획

---

## 📊 작업 관리 (TodoWrite)

### 사용 시점
**사용**: 복잡한 다단계(3+), 비자명한 작업, 사용자 요청, 여러 작업
**미사용**: 단일 간단한 작업, 자명한 작업(<3단계)

### 상태 및 규칙
- `pending` / `in_progress` (정확히 하나만) / `completed`
- 완료 즉시 마크
- 완전히 완료 시에만 completed (에러/블로커 없을 때)

### 형식
```json
{
  "content": "테스트 실행",
  "activeForm": "테스트 실행 중",
  "status": "in_progress"
}
```

---

## 🎨 소통 방식

### 톤
- 짧고 간결하게 (CLI 환경)
- 전문적 객관성 (과도한 칭찬 금지)
- Github-flavored markdown
- 이모지는 사용자 요청 시에만

### 계획
- ✅ 구체적 단계
- ❌ 시간 추정("2-3주"), "나중에" 약속

---

## 🌐 크로스 플랫폼

### 공백이 있는 경로
**항상 따옴표**: `cd "path with spaces/file.txt"`

### 플랫폼별 명령
```bash
# Windows: Copy-Item .env.example .env
# Unix: cp .env.example .env
```

---

## 🔐 보안

### 환경 변수
- API 키 → `.env.local` (`.gitignore`에 추가)
- `.env.example` 제공 (실제 값 제외)

### 절대 커밋 금지
`.env`, `credentials.json`, 하드코딩된 키 (사용자 요청해도 경고)

---

## 📚 프로젝트 커스터마이징

이 템플릿으로 프로젝트별 CLAUDE.md 생성 시:

### 유지 (템플릿에서)
위의 모든 핵심 원칙

### 추가 (프로젝트별)
- 프로젝트 개요
- 기술 스택
- 개발 명령어
- **Quick Reference** (7-10개 핵심 패턴)
- 중요 구현 세부사항

### 크기 제약
- CLAUDE.md: **≤300줄**
- Quick Reference: **7-10개 패턴만**
- 상세 내용 → 별도 문서 (important-docs/)

---

**템플릿 버전**: 2.1 (한글 + KST)
**최종 업데이트**: 2025-11-20
**줄 수**: ~220
