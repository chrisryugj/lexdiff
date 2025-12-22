#!/bin/bash
# 프로젝트 백업 설정을 전역 Claude로 복원
# 실행: bash .claude/sync-to-global.sh

PROJECT_SYNC_DIR="$(dirname "$0")/sync"
GLOBAL_CLAUDE_DIR="$HOME/.claude"

# sync 폴더 존재 확인
if [ ! -d "$PROJECT_SYNC_DIR" ]; then
    echo "❌ 에러: $PROJECT_SYNC_DIR 폴더가 없습니다."
    echo "💡 먼저 git pull로 최신 설정을 받으세요."
    exit 1
fi

echo "🔄 프로젝트 설정 → 전역 Claude 복원 시작..."
echo ""

# 백업 확인 메시지
echo "⚠️  경고: 전역 Claude 설정(~/.claude/)이 덮어씌워집니다!"
echo "📁 복원 소스: .claude/sync/"
echo ""
read -p "계속하시겠습니까? (y/N): " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "❌ 복원이 취소되었습니다."
    exit 0
fi

echo ""
echo "📥 복원 중..."

# 전역 .claude 폴더 생성 (없으면)
mkdir -p "$GLOBAL_CLAUDE_DIR"

# 1. 전역 설정 파일
echo "📄 전역 설정 파일 복원 중..."
cp "$PROJECT_SYNC_DIR/CLAUDE.md" "$GLOBAL_CLAUDE_DIR/" 2>/dev/null && echo "  ✅ CLAUDE.md"
cp "$PROJECT_SYNC_DIR/settings.json" "$GLOBAL_CLAUDE_DIR/" 2>/dev/null && echo "  ✅ settings.json"
cp "$PROJECT_SYNC_DIR/statusline.sh" "$GLOBAL_CLAUDE_DIR/" 2>/dev/null && chmod +x "$GLOBAL_CLAUDE_DIR/statusline.sh" && echo "  ✅ statusline.sh"

# 2. 슬래시 명령어 (commands/)
if [ -d "$PROJECT_SYNC_DIR/commands" ]; then
    echo "📁 슬래시 명령어 복원 중..."
    rm -rf "$GLOBAL_CLAUDE_DIR/commands"
    cp -r "$PROJECT_SYNC_DIR/commands" "$GLOBAL_CLAUDE_DIR/" && echo "  ✅ commands/ ($(ls -1 $GLOBAL_CLAUDE_DIR/commands 2>/dev/null | wc -l)개)"
fi

# 3. 출력 스타일 (output-styles/)
if [ -d "$PROJECT_SYNC_DIR/output-styles" ]; then
    echo "🎨 출력 스타일 복원 중..."
    rm -rf "$GLOBAL_CLAUDE_DIR/output-styles"
    cp -r "$PROJECT_SYNC_DIR/output-styles" "$GLOBAL_CLAUDE_DIR/" && echo "  ✅ output-styles/ ($(ls -1 $GLOBAL_CLAUDE_DIR/output-styles 2>/dev/null | wc -l)개)"
fi

# 4. 스킬 (전역 스킬만)
if [ -d "$PROJECT_SYNC_DIR/skills" ]; then
    echo "🛠️  전역 스킬 복원 중..."
    # 기존 전역 스킬 폴더가 없으면 생성
    mkdir -p "$GLOBAL_CLAUDE_DIR/skills"

    # user 스킬만 복원 (기존 것 덮어쓰기)
    cp -r "$PROJECT_SYNC_DIR/skills"/*.md "$GLOBAL_CLAUDE_DIR/skills/" 2>/dev/null && echo "  ✅ skills/ (전역 스킬)"
fi

# 복원 완료 메시지
echo ""
echo "✅ 복원 완료!"
echo ""
echo "📋 복원된 설정:"
echo "   - CLAUDE.md (전역 지침)"
echo "   - settings.json (모델/권한/플러그인)"
echo "   - statusline.sh (상태 표시줄)"
echo "   - commands/ (슬래시 명령어)"
echo "   - output-styles/ (출력 스타일)"
if [ -d "$GLOBAL_CLAUDE_DIR/skills" ]; then
    echo "   - skills/ (전역 스킬)"
fi
echo ""
echo "💡 다음 단계:"
echo "   1. Claude Code 재시작 (Ctrl+C 후 재실행)"
echo "   2. 설정 확인: 전역 CLAUDE.md는 자동으로 모든 프로젝트에 적용됨"
echo "   3. 인증 정보는 별도로 설정 필요 (.credentials.json)"
echo ""
echo "📂 전역 설정 위치: $GLOBAL_CLAUDE_DIR"
