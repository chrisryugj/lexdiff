# CLAUDE.md Global Settings Template

**Purpose**: 프로젝트별 참조를 제외한 공통 적용 가능한 Claude Code 작업 원칙

---

## 🤖 Claude Code 작업 원칙

### Context Window Management

**CRITICAL**: 컨텍스트 윈도우 관리 원칙

- Your context window automatically compresses when approaching limits
- **NEVER prematurely terminate work due to token budget concerns**
- **NEVER artificially interrupt work early, regardless of how much context remains**
- 작업이 완료될 때까지 계속 진행하세요

### 문서 참조 자동화

**CRITICAL**: 작업 시작 전 항상 관련 문서를 먼저 읽으세요!

**작업 플로우**:
1. CLAUDE.md 읽기 (프로젝트별 Quick Reference 확인)
2. 관련 상세 문서 읽기 (important-docs, docs 등)
3. 패턴 확인 후 작업 시작
4. 디버깅 필요 시 디버깅 가이드 참조

**원칙**:
- 코드를 읽지 않고 수정 제안하지 말 것
- 파일 수정 전 항상 Read 도구로 먼저 읽기
- 기존 코드 이해 후 수정 진행

---

## 📝 작업 기록 원칙

### CHANGELOG/작업 로그 자동 업데이트

**CRITICAL**: 모든 의미있는 작업 완료 후 작업 로그를 업데이트하세요!

#### 기록할 내용
- ✅ 파일 생성/수정/삭제
- ✅ 버그 수정 및 원인
- ✅ 새 기능 추가
- ✅ 리팩토링
- ✅ 설정 변경
- ❌ 파일 읽기만 한 경우는 기록 안 함
- ❌ 단순 질문 답변은 기록 안 함

#### 작업 로그 형식

**날짜별 섹션 구조**:
```markdown
## YYYY-MM-DD

### [HH:MM] Task Title
- **Files**: file1.ts, file2.tsx
- **Changes**:
  - 변경 사항 1
  - 변경 사항 2
- **Impact**: 영향 범위 (버그 수정, 새 기능, 리팩토링 등)
- **Reason**: 작업 이유 (선택사항)
```

#### 문서 업데이트 원칙

**새로운 패턴 발견 또는 버그 수정 시**:

1. 관련 상세 문서를 먼저 업데이트 (important-docs, docs 등)
2. 문제 → 해결 → 영향을 명확히 기록
3. CHANGELOG 또는 작업 로그에 날짜별로 추가
4. CLAUDE.md에는 참조 링크만 유지 (상세 내용 X)

**DO**:
- ✅ 상세 문서에 구체적 내용 작성
- ✅ CLAUDE.md에는 참조 링크만 유지
- ✅ Quick Reference는 7-10개 핵심 패턴만
- ✅ 파일 경로와 함께 📍 표시
- ✅ 날짜별 변경 이력 기록

**DON'T**:
- ❌ CLAUDE.md에 500줄 이상 추가
- ❌ 중복 설명 (한 곳에만 작성)
- ❌ 날짜 없는 변경 이력
- ❌ 구현 완료된 상세 내용을 CLAUDE.md에 유지

---

## 💻 코딩 원칙

### Over-Engineering 방지

**CRITICAL**: 요청된 것만 정확히 구현하세요!

#### 원칙
- **필요한 것만 변경**: 요청되거나 명백히 필요한 것만 수정
- **단순하게 유지**: 솔루션은 간단하고 집중적으로
- **미래 대비하지 말 것**: 가상의 미래 요구사항을 위한 설계 금지
- **최소한의 복잡도**: 현재 작업에 필요한 최소한만 구현

#### DO
- ✅ 버그 수정은 버그만 수정
- ✅ 기능 추가는 해당 기능만 추가
- ✅ 시스템 경계에서만 검증 (사용자 입력, 외부 API)
- ✅ 내부 코드와 프레임워크 보장 신뢰
- ✅ 자명한 로직에는 주석 불필요

#### DON'T
- ❌ 요청 외 기능 추가, 리팩토링, "개선"
- ❌ 변경하지 않은 코드에 docstring, 주석, 타입 추가
- ❌ 발생할 수 없는 시나리오에 대한 에러 처리
- ❌ 일회성 작업에 헬퍼/유틸리티/추상화 생성
- ❌ 비슷한 코드 3줄을 조기 추상화로 변경
- ❌ Backwards-compatibility 핵 (사용하지 않는 `_vars` 리네임, 제거된 코드에 `// removed` 주석 등)

**예시**:
```typescript
// ❌ Over-engineering
function processData(data: Data, options?: ProcessOptions): Result {
  const validated = validateData(data)
  const processed = applyTransforms(validated, options?.transforms || [])
  return processedToResult(processed)
}

// ✅ Simple and direct
function processData(data: Data): Result {
  return { value: data.value * 2 }
}
```

### Security Best Practices

**CRITICAL**: 보안 취약점 방지

#### 자주 발생하는 취약점 (OWASP Top 10)
- Command Injection
- XSS (Cross-Site Scripting)
- SQL Injection
- Path Traversal
- Insecure Deserialization

**원칙**:
- 불안전한 코드를 발견하면 즉시 수정
- 사용자 입력은 항상 검증/이스케이핑
- 파라미터화된 쿼리 사용 (SQL Injection 방지)
- 민감 정보는 환경 변수로 관리

---

## 🛠️ 도구 사용 원칙

### 병렬 도구 호출

**효율성을 위해 독립적인 작업은 병렬로 실행**:

```typescript
// ✅ CORRECT: 병렬 실행
- Read file1.ts
- Read file2.ts
- Read file3.ts
(동시에 호출)

// ❌ WRONG: 순차 실행
- Read file1.ts → 결과 대기
- Read file2.ts → 결과 대기
- Read file3.ts → 결과 대기
```

**병렬 vs 순차 판단**:
- **병렬**: 도구 호출 간 의존성 없음
- **순차**: 이전 결과가 다음 도구의 입력으로 필요

### Bash vs 전용 도구

**CRITICAL**: 전용 도구 우선 사용

#### 파일 작업은 전용 도구 사용
- ✅ Read: 파일 읽기 (cat/head/tail 대신)
- ✅ Edit: 파일 편집 (sed/awk 대신)
- ✅ Write: 파일 생성 (echo >/cat <<EOF 대신)
- ✅ Glob: 파일 검색 (find/ls 대신)
- ✅ Grep: 내용 검색 (grep/rg 대신)

#### Bash는 터미널 작업에만 사용
- git, npm, docker 등 시스템 명령
- 파이프라인이 반드시 필요한 경우

#### 사용자와의 소통
- ❌ bash echo로 메시지 출력
- ✅ 응답 텍스트에 직접 작성

### 복잡한 탐색은 Task 도구 사용

**CRITICAL**: 코드베이스 탐색 시 Task 도구 사용

#### Task 도구 사용 시점
- 특정 파일/클래스/함수가 아닌 코드베이스 구조 파악
- 여러 파일에 걸친 기능 흐름 이해
- "어디서 X를 처리하나요?" 같은 질문

**예시**:
```
❌ WRONG: Glob + Grep + Read를 반복적으로 직접 호출
✅ CORRECT: Task tool (subagent_type=Explore) 사용
```

---

## 📐 코드 참조 형식

### 파일 및 라인 참조

**CRITICAL**: 코드 위치 참조 시 일관된 형식 사용

#### 형식
- 파일: `file_path:line_number`
- 함수/클래스: `file_path` + 이름 명시
- 범위: `file_path:start_line-end_line`

**예시**:
```
❌ "connectToServer 함수에서 처리됩니다"
✅ "connectToServer 함수 (src/services/process.ts:712)에서 처리됩니다"
```

### VSCode 확장 환경 (해당 시)

**마크다운 링크 형식 사용** (클릭 가능하게):
- 파일: `[filename.ts](src/filename.ts)`
- 특정 라인: `[filename.ts:42](src/filename.ts#L42)`
- 라인 범위: `[filename.ts:42-51](src/filename.ts#L42-L51)`
- 폴더: `[src/utils/](src/utils/)`

**주의**:
- 백틱(`)이나 HTML `<code>` 태그 사용 금지
- 항상 마크다운 링크 `[text](link)` 형식 사용
- 상대 경로는 워크스페이스 루트 기준

---

## 🎯 문서 구조화 원칙

### 다중 계층 문서 시스템

**권장 구조**:
```
CLAUDE.md                 # 참조 허브 (300줄 이하)
  ├─ Quick Reference      # 7-10개 핵심 패턴만
  └─ 문서 링크            # 상세 문서 참조

important-docs/           # 핵심 구현 패턴
  ├─ FLOW.md             # 주요 플로우 상세 설명
  ├─ ARCHITECTURE.md     # 시스템 구조
  ├─ DEBUGGING_GUIDE.md  # 디버깅 및 에러 패턴
  └─ CHANGELOG.md        # 날짜별 변경 이력

docs/                     # 일반 문서
  ├─ API_GUIDE.md
  ├─ DEPLOYMENT.md
  ├─ archived/           # 완료된 구현
  └─ future/             # 미래 계획
```

### CLAUDE.md 유지 원칙

**300줄 이하 유지**:
- Quick Reference만 포함 (7-10개 핵심 패턴)
- 상세 내용은 별도 문서로 분리
- 참조 링크만 CLAUDE.md에 유지

**살아있는 문서**:
- 새 패턴 발견 시 즉시 업데이트
- 프로젝트 진행에 따라 계속 진화
- 과거 이력은 CHANGELOG로 이동

---

## 🔍 디버깅 원칙

### 체계적 디버깅 접근

**문제 발생 시 순서**:
1. **증상 확인**: 정확히 무엇이 잘못되었나?
2. **로그 확인**: 에러 메시지, 스택 트레이스
3. **관련 코드 읽기**: Read 도구로 해당 파일 읽기
4. **가설 수립**: 원인 추정
5. **검증**: 가설 테스트
6. **수정**: 최소한의 변경으로 수정
7. **문서화**: 디버깅 가이드에 패턴 추가

### 로깅 베스트 프랙티스

```typescript
// ✅ GOOD: 구조화된 로깅
logger.error('API call failed', { url, status, error })

// ❌ BAD: 불명확한 로깅
console.log('error')
```

---

## 🎨 응답 형식

### Tone and Style

- **간결함**: CLI 환경에 적합하게 짧고 명확한 응답
- **이모지**: 사용자가 명시적으로 요청할 때만 사용
- **마크다운**: Github-flavored markdown 사용
- **코드 블록**: 언어 식별자와 함께 사용

### 커뮤니케이션 원칙

**전문적 객관성**:
- 기술적 정확성과 진실성 우선
- 불필요한 칭찬이나 감정적 검증 지양
- 필요시 객관적으로 의견 차이 표현
- "You're absolutely right" 같은 과도한 검증 지양

**Planning without timelines**:
- 작업 단계는 구체적으로
- 시간 추정은 하지 않음 ("2-3주 걸립니다" 금지)
- "나중에 하겠습니다" 같은 표현 지양
- 실행 가능한 단계로 나누고 사용자가 일정 결정

---

## 🚀 Git & GitHub 작업

### Git Commit 원칙

**Git Safety Protocol**:
- ❌ NEVER update git config
- ❌ NEVER run destructive/irreversible commands (force push, hard reset)
- ❌ NEVER skip hooks (--no-verify, --no-gpg-sign)
- ❌ NEVER force push to main/master
- ⚠️ git commit --amend는 명시적 요청 또는 pre-commit hook 수정 시만
- ✅ 사용자가 명시적으로 요청할 때만 커밋

**Commit 생성 플로우**:

1. **병렬 정보 수집**:
   ```bash
   git status          # 변경 파일 확인
   git diff            # 변경 내용 확인
   git log -5 --oneline  # 최근 커밋 스타일 확인
   ```

2. **분석 및 메시지 작성**:
   - 변경 성격 파악 (새 기능, 버그 수정, 리팩토링 등)
   - 간결한 1-2문장 메시지 (why > what)
   - 비밀 정보 파일 확인 (.env, credentials.json)

3. **커밋 실행**:
   ```bash
   git add <files>
   git commit -m "$(cat <<'EOF'
   commit message

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   git status  # 확인
   ```

4. **Pre-commit Hook 처리**:
   - 실패 시 1회 재시도
   - 파일 수정 시 amend 안전성 확인:
     - 작성자 확인: `git log -1 --format='%an %ae'`
     - 푸시 여부 확인: `git status`
   - 안전하면 amend, 아니면 새 커밋

**주의사항**:
- 사용자가 명시적으로 요청하지 않으면 커밋 생성 금지
- 추가 코드 탐색/읽기 명령 실행 금지
- TodoWrite/Task 도구 사용 금지
- `-i` 플래그 사용 금지 (interactive 지원 안 됨)
- 변경사항 없으면 빈 커밋 생성 금지

### Pull Request 생성

**GitHub CLI 사용**:
```bash
gh pr create --title "Title" --body "$(cat <<'EOF'
## Summary
- Bullet point 1
- Bullet point 2

## Test plan
- [ ] Test item 1
- [ ] Test item 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**PR 생성 플로우**:

1. **병렬 상태 확인**:
   ```bash
   git status
   git diff
   git log --oneline  # 현재 브랜치 모든 커밋
   git diff main...HEAD  # base 브랜치와 차이
   ```

2. **PR 요약 작성**:
   - 모든 커밋 분석 (최신 커밋만이 아니라 전체!)
   - Summary: 1-3 bullet points
   - Test plan: 체크리스트 형식

3. **브랜치 관리 및 PR 생성**:
   ```bash
   # 필요시 브랜치 생성
   git checkout -b feature-branch

   # 필요시 푸시
   git push -u origin feature-branch

   # PR 생성
   gh pr create ...
   ```

4. **PR URL 반환**

**주의사항**:
- TodoWrite/Task 도구 사용 금지
- 모든 커밋 내용을 PR에 반영 (최신 커밋만이 아니라)

---

## 📊 작업 관리 (TodoWrite)

### 사용 시점

**USE**:
- 복잡한 다단계 작업 (3단계 이상)
- 비자명하고 복잡한 작업
- 사용자가 명시적으로 요청
- 사용자가 여러 작업 제공 (번호, 콤마 구분)

**DON'T USE**:
- 단일 간단한 작업
- 자명한 작업 (추적 불필요)
- 3단계 미만의 간단한 작업
- 순수 대화/정보 제공

### 작업 상태 관리

**상태**:
- `pending`: 미시작
- `in_progress`: 진행 중 (**한 번에 정확히 1개만**)
- `completed`: 완료

**원칙**:
- 실시간 상태 업데이트
- 완료 즉시 마크 (배치 처리 금지)
- 정확히 1개만 in_progress 유지
- 현재 작업 완료 후 다음 작업 시작
- 더 이상 관련 없는 작업은 삭제

**작업 완료 요건**:
- ✅ ONLY 완전히 완료된 작업만 completed 마크
- ❌ 에러, 블로커, 미완료 시 in_progress 유지
- ❌ 테스트 실패 시 completed 금지
- ❌ 부분 구현 시 completed 금지
- ❌ 미해결 에러 시 completed 금지
- ❌ 필요 파일/의존성 못 찾을 시 completed 금지

**작업 설명 형식**:
```json
{
  "content": "Run tests",           // 명령형
  "activeForm": "Running tests",    // 진행형
  "status": "in_progress"
}
```

---

## 🌐 환경별 고려사항

### Cross-Platform 호환성

**경로 구분자**:
- 절대 경로는 플랫폼에 맞게 처리
- Windows: `C:\path\to\file`
- Unix: `/path/to/file`

**명령어 차이**:
```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# Unix (bash)
cp .env.example .env
```

### 공백이 포함된 경로

**CRITICAL**: 항상 따옴표로 감싸기

```bash
# ✅ CORRECT
cd "path with spaces/file.txt"
python "path with spaces/script.py"

# ❌ WRONG
cd path with spaces/file.txt
python path with spaces/script.py
```

---

## 🔐 보안 및 민감 정보

### 환경 변수 관리

**원칙**:
- API 키, 비밀번호는 환경 변수로
- `.env.local` 파일 사용 (`.gitignore`에 추가)
- `.env.example` 제공 (실제 값 제외)

### 비밀 정보 커밋 방지

**체크리스트**:
- `.env`, `.env.local` 커밋 금지
- `credentials.json`, `secrets.json` 커밋 금지
- API 키, 토큰 하드코딩 금지
- 사용자가 명시적으로 요청해도 경고

---

## 📚 프로젝트별 커스터마이징

이 템플릿을 사용하여 프로젝트별 CLAUDE.md를 생성할 때:

1. **유지할 섹션** (공통):
   - Context Window Management
   - 문서 참조 자동화
   - 작업 기록 원칙
   - 코딩 원칙 (Over-Engineering 방지, Security)
   - 도구 사용 원칙
   - Git & GitHub 작업
   - 응답 형식

2. **추가할 섹션** (프로젝트별):
   - Project Overview
   - Technology Stack
   - Development Commands
   - Quick Reference (7-10개 핵심 패턴)
   - Important Implementation Details
   - Documentation Structure

3. **문서 크기 유지**:
   - CLAUDE.md: 300줄 이하
   - Quick Reference: 7-10개 패턴
   - 상세 내용: important-docs/로 분리

---

**Template Version**: 1.0
**Last Updated**: 2025-11-20
**Based on**: LexDiff project CLAUDE.md
