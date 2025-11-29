# Claude Code /doctor 수정 가이드

`/doctor` 명령어 실행 시 발견되는 일반적인 오류와 수정 방법을 정리합니다.

---

## 1. Agent 파일 frontmatter 누락

### 오류
```
Agent files in .claude/agents/ missing required frontmatter
```

### 원인
`.claude/agents/*.md` 파일에 YAML frontmatter가 없음

### 수정 방법
각 에이전트 파일 **최상단**에 frontmatter 추가:

```markdown
---
name: agent-name
description: 에이전트 설명 (한 줄)
---

# Agent Title
...
```

### 예시 (api-debugger.md)
```markdown
---
name: api-debugger
description: API 통합 문제 진단, XML/JSON 파싱 에러 해결 전문 에이전트
---

# API Debugger Agent

**Purpose**: API 통합 문제 진단...
```

### 적용 대상 파일
- `.claude/agents/api-debugger.md`
- `.claude/agents/component-refactor.md`
- `.claude/agents/doc-maintainer.md`
- `.claude/agents/regex-pattern-expert.md`
- `.claude/agents/task-logger.md`
- 기타 모든 커스텀 에이전트

---

## 2. .clauderc 파일 deprecated

### 오류
```
.clauderc is deprecated, settings should be in .claude/settings.json
```

### 원인
`.clauderc` 파일은 더 이상 지원되지 않음

### 수정 방법
1. `.clauderc` 파일 삭제
2. 설정이 필요하면 `.claude/settings.json` 또는 `.claude/settings.local.json` 사용

### 마이그레이션
`.clauderc` 내용을 `CLAUDE.md`로 이동하는 것이 좋음:

**Before (.clauderc)**:
```json
{
  "workflowRules": [
    "파일 수정 시 항상 Read 먼저 수행",
    "새 파일 생성보다 기존 파일 수정 우선"
  ]
}
```

**After (CLAUDE.md)**:
```markdown
## 작업 규칙
- 파일 수정 시 항상 Read 먼저 수행
- 새 파일 생성보다 기존 파일 수정 우선
```

---

## 3. settings.local.json 권한 문제 (Windows)

### 오류
```
LF will be replaced by CRLF
```

### 원인
Windows와 Git 줄바꿈 설정 불일치

### 수정 방법
무시해도 됨. 필요시:
```bash
git config core.autocrlf true
```

---

## 빠른 체크리스트

프로젝트에 Claude Code 설정 시 확인할 사항:

```
✅ .claude/agents/*.md - frontmatter 있는지 확인
✅ .clauderc - 삭제 (deprecated)
✅ CLAUDE.md - 프로젝트 규칙 정리
✅ .claude/settings.json - 필요시 설정
```

---

## /doctor 실행 방법

```bash
# Claude Code CLI에서
/doctor

# 또는 터미널에서
claude doctor
```

**정상 결과**:
```
All checks passed!
```

---

**Last Updated**: 2025-11-26
