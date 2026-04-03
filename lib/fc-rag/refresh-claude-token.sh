#!/bin/bash
# Claude OAuth access token 사전 갱신 (cron용, 매시간 실행)
# CLI를 non-bare 모드로 실행 → CLI가 내부적으로 OAuth refresh 수행
#
# 토큰 수명 ~6시간, 크론 1시간 간격, 임계값 4시간
# → 만료 4시간 전부터 매시간 갱신 시도 = 최소 3회 기회

LOG_FILE="$HOME/.claude/token-refresh.log"
CRED_FILE="$HOME/.claude/.credentials.json"
CLAUDE_BIN="$HOME/.local/bin/claude"
REFRESH_THRESHOLD_MS=14400000  # 4시간 (밀리초)

# .credentials.json 없으면 종료
if [ ! -f "$CRED_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] SKIP: $CRED_FILE not found" >> "$LOG_FILE"
  exit 0
fi

# 현재 토큰 만료 시간 확인
EXPIRES_AT=$(python3 -c "import json; print(json.load(open('$CRED_FILE'))['claudeAiOauth']['expiresAt'])" 2>/dev/null)
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
REMAINING_MS=$((EXPIRES_AT - NOW_MS))
REMAINING_MIN=$((REMAINING_MS / 60000))

echo "[$(date '+%Y-%m-%d %H:%M:%S')] remaining=${REMAINING_MIN}min" >> "$LOG_FILE"

# 이미 만료된 경우
if [ "$REMAINING_MS" -le 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] EXPIRED! trying CLI refresh..." >> "$LOG_FILE"
  echo "respond with OK" | "$CLAUDE_BIN" --print > /dev/null 2>&1

  NEW_EXPIRES=$(python3 -c "import json; print(json.load(open('$CRED_FILE'))['claudeAiOauth']['expiresAt'])" 2>/dev/null)
  NEW_REMAINING=$(( (NEW_EXPIRES - $(python3 -c "import time; print(int(time.time()*1000))")) / 60000 ))

  if [ "$NEW_EXPIRES" != "$EXPIRES_AT" ] && [ "$NEW_REMAINING" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] RECOVERED: new expiry in ${NEW_REMAINING}min" >> "$LOG_FILE"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAIL: still expired. Run: claude setup-token" >> "$LOG_FILE"
  fi
  exit 0
fi

# 임계값(4시간) 이내면 갱신 시도
if [ "$REMAINING_MS" -lt "$REFRESH_THRESHOLD_MS" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] refreshing (${REMAINING_MIN}min left)..." >> "$LOG_FILE"

  echo "respond with OK" | "$CLAUDE_BIN" --print > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    NEW_EXPIRES=$(python3 -c "import json; print(json.load(open('$CRED_FILE'))['claudeAiOauth']['expiresAt'])" 2>/dev/null)
    NEW_REMAINING=$(( (NEW_EXPIRES - $(python3 -c "import time; print(int(time.time()*1000))")) / 60000 ))

    if [ "$NEW_EXPIRES" != "$EXPIRES_AT" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: refreshed, new expiry in ${NEW_REMAINING}min" >> "$LOG_FILE"
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] CLI OK but unchanged (${NEW_REMAINING}min left, CLI may defer refresh)" >> "$LOG_FILE"
    fi
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAIL: CLI exit non-zero" >> "$LOG_FILE"
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: still valid" >> "$LOG_FILE"
fi

# 로그 크기 관리 (100KB 초과 시 truncate)
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt 102400 ]; then
  tail -100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi
