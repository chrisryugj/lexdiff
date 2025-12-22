#!/bin/bash
# 전역 Claude 설정을 프로젝트로 동기화
# 실행: bash .claude/sync-from-global.sh

PROJECT_SYNC_DIR="$(dirname "$0")/sync"
GLOBAL_CLAUDE_DIR="$HOME/.claude"

echo "🔄 전역 Claude 설정 → 프로젝트 동기화 시작..."

# sync 폴더 생성
mkdir -p "$PROJECT_SYNC_DIR"

# 1. 전역 설정 파일
echo "📄 전역 설정 파일 백업 중..."
cp "$GLOBAL_CLAUDE_DIR/CLAUDE.md" "$PROJECT_SYNC_DIR/" 2>/dev/null && echo "  ✅ CLAUDE.md"
cp "$GLOBAL_CLAUDE_DIR/settings.json" "$PROJECT_SYNC_DIR/" 2>/dev/null && echo "  ✅ settings.json"
cp "$GLOBAL_CLAUDE_DIR/statusline.sh" "$PROJECT_SYNC_DIR/" 2>/dev/null && echo "  ✅ statusline.sh"

# 2. 슬래시 명령어 (commands/)
echo "📁 슬래시 명령어 백업 중..."
rm -rf "$PROJECT_SYNC_DIR/commands"
cp -r "$GLOBAL_CLAUDE_DIR/commands" "$PROJECT_SYNC_DIR/" 2>/dev/null && echo "  ✅ commands/ ($(ls -1 $GLOBAL_CLAUDE_DIR/commands 2>/dev/null | wc -l)개)"

# 3. 출력 스타일 (output-styles/)
echo "🎨 출력 스타일 백업 중..."
rm -rf "$PROJECT_SYNC_DIR/output-styles"
cp -r "$GLOBAL_CLAUDE_DIR/output-styles" "$PROJECT_SYNC_DIR/" 2>/dev/null && echo "  ✅ output-styles/ ($(ls -1 $GLOBAL_CLAUDE_DIR/output-styles 2>/dev/null | wc -l)개)"

# 4. 스킬 (전역 스킬만, 프로젝트 스킬은 제외)
if [ -d "$GLOBAL_CLAUDE_DIR/skills" ]; then
    echo "🛠️  전역 스킬 백업 중..."
    rm -rf "$PROJECT_SYNC_DIR/skills"
    mkdir -p "$PROJECT_SYNC_DIR/skills"

    # user 스킬만 복사 (managed, plugin 제외)
    if [ -d "$GLOBAL_CLAUDE_DIR/skills" ]; then
        cp -r "$GLOBAL_CLAUDE_DIR/skills"/*.md "$PROJECT_SYNC_DIR/skills/" 2>/dev/null
        echo "  ✅ skills/ (전역 스킬)"
    fi
fi

# 5. README 생성
cat > "$PROJECT_SYNC_DIR/README.md" <<EOF
# Claude Code 전역 설정 백업

**백업 시각**: $(date '+%Y-%m-%d %H:%M:%S')
**소스**: ~/.claude/

## 📦 백업된 파일

### 전역 설정
- \`CLAUDE.md\` - 전역 지침
- \`settings.json\` - 모델, 권한, 플러그인 설정
- \`statusline.sh\` - 상태 표시줄 스크립트

### 디렉토리
- \`commands/\` - 슬래시 명령어
- \`output-styles/\` - 출력 스타일
- \`skills/\` - 전역 스킬 (user 스킬만)

## 🔄 복원 방법

### 새 기기에서:
\`\`\`bash
# 1. 프로젝트 클론 후
git clone <repo>
cd <project>

# 2. 복원 스크립트 실행
bash .claude/sync-to-global.sh
\`\`\`

## 📝 사용법

### 백업 (전역 → 프로젝트)
\`\`\`bash
bash .claude/sync-from-global.sh
git add .claude/sync
git commit -m "chore: Claude 설정 백업"
\`\`\`

### 복원 (프로젝트 → 전역)
\`\`\`bash
git pull
bash .claude/sync-to-global.sh
\`\`\`

## ⚠️ 동기화 금지 파일

다음 파일은 **절대 백업/동기화하지 마세요**:
- \`.credentials.json\` (인증 정보)
- \`history.jsonl\` (대화 기록)
- \`stats-cache.json\` (통계)
- \`telemetry/\` (원격 측정)
EOF

# 백업 완료 메시지
echo ""
echo "✅ 백업 완료!"
echo "📁 백업 위치: .claude/sync/"
echo ""
echo "💡 다음 단계:"
echo "   git add .claude/sync"
echo "   git commit -m 'chore: Claude 설정 백업'"
echo "   git push"
