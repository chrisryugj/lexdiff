# Claude Code 환경 동기화 가이드

이 폴더는 집/회사 등 여러 환경에서 동일한 Claude Code 설정을 사용하기 위한 동기화 파일들을 포함합니다.

---

## 폴더 구조

```
.claude/sync/
├── SYNC_GUIDE.md          # 이 가이드
├── settings.json          # 전역 settings.json
├── mcp-config.json        # MCP 서버 설정
├── commands/              # 커스텀 슬래시 커맨드
│   ├── commit.md
│   ├── pull.md
│   └── push.md
└── skills/                # 커스텀 스킬
    ├── artifacts-builder/
    │   └── SKILL.md
    └── frontend-design/
        └── SKILL.md
```

---

## 회사/새 환경에서 설정 적용 방법

### 1단계: 프로젝트 클론 및 최신화
```bash
git clone https://github.com/chrisryugj/lexdiff.git
cd lexdiff
git pull
```

### 2단계: 전역 CLAUDE.md 복사
```bash
# Windows (PowerShell)
Copy-Item ".\.claude\global-claude-md.sync.md" "$env:USERPROFILE\.claude\CLAUDE.md" -Force

# Windows (Git Bash)
cp .claude/global-claude-md.sync.md ~/.claude/CLAUDE.md

# Mac/Linux
cp .claude/global-claude-md.sync.md ~/.claude/CLAUDE.md
```

### 3단계: 전역 settings.json 복사
```bash
# Windows (PowerShell)
Copy-Item ".\.claude\sync\settings.json" "$env:USERPROFILE\.claude\settings.json" -Force

# Windows (Git Bash) / Mac / Linux
cp .claude/sync/settings.json ~/.claude/settings.json
```

### 4단계: 커스텀 커맨드 복사
```bash
# Windows (PowerShell)
New-Item -ItemType Directory -Path "$env:USERPROFILE\.claude\commands" -Force
Copy-Item ".\.claude\sync\commands\*" "$env:USERPROFILE\.claude\commands\" -Force

# Windows (Git Bash) / Mac / Linux
mkdir -p ~/.claude/commands
cp .claude/sync/commands/* ~/.claude/commands/
```

### 5단계: 커스텀 스킬 복사
```bash
# Windows (PowerShell)
Copy-Item ".\.claude\sync\skills" "$env:USERPROFILE\.claude\" -Recurse -Force

# Windows (Git Bash) / Mac / Linux
cp -r .claude/sync/skills ~/.claude/
```

### 6단계: MCP 서버 설정
MCP 설정은 프로젝트별로 적용됩니다. `.claude/mcp.json`에 이미 포함되어 있습니다.

전역으로 적용하려면:
```bash
# Windows (PowerShell)
Copy-Item ".\.claude\sync\mcp-config.json" "$env:USERPROFILE\.claude.json" -Force

# 또는 ~/.claude.json의 mcpServers 섹션에 병합
```

---

## 한 번에 모두 복사 (Windows PowerShell)

```powershell
# 디렉토리 생성
New-Item -ItemType Directory -Path "$env:USERPROFILE\.claude\commands" -Force
New-Item -ItemType Directory -Path "$env:USERPROFILE\.claude\skills" -Force

# 파일 복사
Copy-Item ".\.claude\global-claude-md.sync.md" "$env:USERPROFILE\.claude\CLAUDE.md" -Force
Copy-Item ".\.claude\sync\settings.json" "$env:USERPROFILE\.claude\settings.json" -Force
Copy-Item ".\.claude\sync\commands\*" "$env:USERPROFILE\.claude\commands\" -Force
Copy-Item ".\.claude\sync\skills" "$env:USERPROFILE\.claude\" -Recurse -Force

Write-Host "동기화 완료!" -ForegroundColor Green
```

---

## 한 번에 모두 복사 (Git Bash / Mac / Linux)

```bash
#!/bin/bash
mkdir -p ~/.claude/commands ~/.claude/skills

cp .claude/global-claude-md.sync.md ~/.claude/CLAUDE.md
cp .claude/sync/settings.json ~/.claude/settings.json
cp .claude/sync/commands/* ~/.claude/commands/
cp -r .claude/sync/skills/* ~/.claude/skills/

echo "동기화 완료!"
```

---

## 설정 변경 후 업데이트 방법

집에서 설정을 변경한 후:

### 1. 전역 → sync 폴더로 복사 (집)
```bash
# CLAUDE.md
cp ~/.claude/CLAUDE.md .claude/global-claude-md.sync.md

# settings.json
cp ~/.claude/settings.json .claude/sync/settings.json

# commands
cp ~/.claude/commands/*.md .claude/sync/commands/

# skills
cp -r ~/.claude/skills/* .claude/sync/skills/
```

### 2. Git에 커밋 & 푸시 (집)
```bash
git add .claude/
git commit -m "chore: Claude Code 설정 동기화"
git push
```

### 3. 회사에서 pull & 적용 (회사)
```bash
git pull
# 위의 "한 번에 모두 복사" 스크립트 실행
```

---

## 포함된 설정 목록

| 항목 | 설명 |
|------|------|
| `CLAUDE.md` | 작업 원칙, 코딩 규칙, Git 워크플로우 |
| `settings.json` | 권한 설정, 활성화된 플러그인 |
| `commands/` | /commit, /pull, /push 커맨드 |
| `skills/` | artifacts-builder, frontend-design |
| `mcp-config.json` | context7, sequential-thinking MCP 서버 |

---

## 플러그인 설치

플러그인은 자동 동기화되지 않습니다. 새 환경에서 수동 설치 필요:

```bash
# Claude Code에서
/plugin install claude-code-plugins/frontend-design
/plugin install claude-code-plugins/feature-dev
```

---

**버전**: 1.0 | **업데이트**: 2025-12-03
