# Claude Code 전역 설정 동기화

## 파일 목록

| 파일 | 설명 |
|------|------|
| `global-settings.json` | 전역 settings.json (opusplan 포함) |
| `global-CLAUDE.md` | 전역 CLAUDE.md |
| `project-CLAUDE.md` | 프로젝트 CLAUDE.md |

## 집/회사 환경에서 적용 방법

```bash
# Git Bash / WSL
cp .claude/sync/global-settings.json ~/.claude/settings.json
cp .claude/sync/global-CLAUDE.md ~/.claude/CLAUDE.md

# Windows PowerShell
Copy-Item ".claude\sync\global-settings.json" "$env:USERPROFILE\.claude\settings.json"
Copy-Item ".claude\sync\global-CLAUDE.md" "$env:USERPROFILE\.claude\CLAUDE.md"
```

## 현재 설정 내용

- `model`: **opusplan** (Plan 모드: Opus, 실행 모드: Sonnet 자동 전환)
- `enabledPlugins`: context7, feature-dev, frontend-design
