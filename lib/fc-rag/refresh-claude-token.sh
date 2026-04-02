#!/bin/bash
# Claude OAuth access token 사전 갱신 (cron용)
# CLI를 non-bare 모드로 실행 → CLI가 내부적으로 OAuth refresh 수행
# 직접 OAuth endpoint curl 호출 제거 → rate limit 회피

LOG_FILE="$HOME/.claude/token-refresh.log"
CRED_FILE="$HOME/.claude/.credentials.json"
CLAUDE_BIN="/Users/mong-e/.local/bin/claude"

# 현재 토큰 만료 시간 확인
EXPIRES_AT=$(python3 -c "import json; print(json.load(open('$CRED_FILE'))['claudeAiOauth']['expiresAt'])" 2>/dev/null)
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
REMAINING_MS=$((EXPIRES_AT - NOW_MS))
REMAINING_MIN=$((REMAINING_MS / 60000))

echo "[$(date '+%Y-%m-%d %H:%M:%S')] token expires in ${REMAINING_MIN}min" >> "$LOG_FILE"

# 만료 2시간 전부터 갱신 시도
if [ "$REMAINING_MS" -lt 7200000 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] refreshing token via CLI..." >> "$LOG_FILE"

  # non-bare CLI 실행 → 내부 OAuth 갱신 트리거
  RESULT=$("$CLAUDE_BIN" --print --max-turns 1 -- "respond with OK" 2>/dev/null)

  if [ $? -eq 0 ]; then
    # 갱신 후 만료 시간 재확인
    NEW_EXPIRES=$(python3 -c "import json; print(json.load(open('$CRED_FILE'))['claudeAiOauth']['expiresAt'])" 2>/dev/null)
    NEW_REMAINING=$(( (NEW_EXPIRES - $(python3 -c "import time; print(int(time.time()*1000))")) / 60000 ))

    if [ "$NEW_EXPIRES" != "$EXPIRES_AT" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: token refreshed via CLI, new expiry in ${NEW_REMAINING}min" >> "$LOG_FILE"
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] CLI ran OK but token unchanged (${NEW_REMAINING}min left)" >> "$LOG_FILE"
    fi
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAIL: CLI refresh failed" >> "$LOG_FILE"

    # 토큰 만료 임박(30분 이내)이면 setup-token 필요 경고
    if [ "$REMAINING_MIN" -lt 30 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: token expires in ${REMAINING_MIN}min. Run: claude setup-token" >> "$LOG_FILE"
    fi
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] token still valid, skipping refresh" >> "$LOG_FILE"
fi

# 로그 파일 크기 관리 (100KB 초과 시 truncate)
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt 102400 ]; then
  tail -100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi
