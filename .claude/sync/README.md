# Claude Code 전역 설정 백업

**백업 시각**: 2025-12-23 00:08:18
**소스**: ~/.claude/

## 📦 백업된 파일

### 전역 설정
- `CLAUDE.md` - 전역 지침
- `settings.json` - 모델, 권한, 플러그인 설정
- `statusline.sh` - 상태 표시줄 스크립트

### 디렉토리
- `commands/` - 슬래시 명령어
- `output-styles/` - 출력 스타일
- `skills/` - 전역 스킬 (user 스킬만)

## 🔄 복원 방법

### 새 기기에서:
```bash
# 1. 프로젝트 클론 후
git clone <repo>
cd <project>

# 2. 복원 스크립트 실행
bash .claude/sync-to-global.sh
```

## 📝 사용법

### 백업 (전역 → 프로젝트)
```bash
bash .claude/sync-from-global.sh
git add .claude/sync
git commit -m "chore: Claude 설정 백업"
```

### 복원 (프로젝트 → 전역)
```bash
git pull
bash .claude/sync-to-global.sh
```

## ⚠️ 동기화 금지 파일

다음 파일은 **절대 백업/동기화하지 마세요**:
- `.credentials.json` (인증 정보)
- `history.jsonl` (대화 기록)
- `stats-cache.json` (통계)
- `telemetry/` (원격 측정)
