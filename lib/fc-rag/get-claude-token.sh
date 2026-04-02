#!/bin/bash
# apiKeyHelper: Claude --bare 모드에서 유효한 OAuth access token 제공
# 1. .credentials.json에서 토큰 읽기
# 2. 만료 2시간 전이면 CLI 기반 갱신 시도 (rate limit 백오프 포함)
# 3. stdout으로 access token 출력 (apiKeyHelper 규약)

CRED_FILE="$HOME/.claude/.credentials.json"
LOCK_FILE="/tmp/claude-token-refresh.lock"
BACKOFF_FILE="/tmp/claude-token-refresh-backoff"
BACKOFF_SECONDS=1800  # rate limit 시 30분 백오프
REFRESH_THRESHOLD_MS=7200000  # 2시간
CLAUDE_BIN="/Users/mong-e/.local/bin/claude"
LOG_FILE="$HOME/.claude/token-refresh.log"

# .credentials.json 읽기
read_creds() {
  python3 -c "
import json, sys
c = json.load(open('$CRED_FILE'))['claudeAiOauth']
print(c['accessToken'])
print(c.get('refreshToken',''))
print(c.get('expiresAt',0))
" 2>/dev/null
}

CREDS=$(read_creds)
ACCESS_TOKEN=$(echo "$CREDS" | sed -n '1p')
REFRESH_TOKEN=$(echo "$CREDS" | sed -n '2p')
EXPIRES_AT=$(echo "$CREDS" | sed -n '3p')
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
REMAINING_MS=$((EXPIRES_AT - NOW_MS))

# 토큰이 아직 충분히 유효하면 바로 반환
if [ "$REMAINING_MS" -gt "$REFRESH_THRESHOLD_MS" ]; then
  echo "$ACCESS_TOKEN"
  exit 0
fi

# 백오프 체크 — 최근 갱신 실패했으면 기존 토큰 반환 (재시도 안 함)
if [ -f "$BACKOFF_FILE" ]; then
  BACKOFF_AGE=$(( $(date +%s) - $(stat -f %m "$BACKOFF_FILE" 2>/dev/null || echo 0) ))
  if [ "$BACKOFF_AGE" -lt "$BACKOFF_SECONDS" ]; then
    # 백오프 중 — 토큰 유효하면 기존 반환, 만료면 에러
    if [ "$REMAINING_MS" -gt 0 ]; then
      echo "$ACCESS_TOKEN"
      exit 0
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: EXPIRED + backoff active (${BACKOFF_AGE}s/${BACKOFF_SECONDS}s)" >> "$LOG_FILE"
      echo "TOKEN_EXPIRED" >&2
      exit 1
    fi
  else
    rm -f "$BACKOFF_FILE"
  fi
fi

# 동시 실행 방지
if [ -f "$LOCK_FILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -lt 60 ]; then
    # 다른 프로세스가 refresh 중 — 기존 토큰 반환
    if [ "$REMAINING_MS" -gt 0 ]; then
      echo "$ACCESS_TOKEN"
    else
      echo "TOKEN_EXPIRED" >&2
      exit 1
    fi
    exit 0
  fi
  rm -f "$LOCK_FILE"  # stale lock 제거
fi

touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# CLI 기반 갱신: non-bare 모드 실행 → CLI가 내부적으로 OAuth refresh 처리
# (직접 OAuth endpoint curl 호출 대신 CLI 메커니즘 활용 → rate limit 회피)
REFRESH_OUTPUT=$("$CLAUDE_BIN" --print --max-turns 1 -- "respond with OK" 2>/dev/null)

if [ $? -eq 0 ]; then
  # CLI 실행 성공 → credentials.json이 갱신됐을 수 있음, 다시 읽기
  NEW_CREDS=$(read_creds)
  NEW_TOKEN=$(echo "$NEW_CREDS" | sed -n '1p')
  NEW_EXPIRES=$(echo "$NEW_CREDS" | sed -n '3p')
  NEW_REMAINING=$((NEW_EXPIRES - $(python3 -c "import time; print(int(time.time()*1000))")))

  if [ -n "$NEW_TOKEN" ] && [ "$NEW_REMAINING" -gt 0 ]; then
    echo "$NEW_TOKEN"
    if [ "$NEW_EXPIRES" != "$EXPIRES_AT" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: token refreshed via CLI (${NEW_REMAINING}ms left)" >> "$LOG_FILE"
    fi
    exit 0
  fi
fi

# CLI 기반 갱신 실패 — 백오프 설정
touch "$BACKOFF_FILE"

if [ "$REMAINING_MS" -gt 0 ]; then
  # 토큰 아직 유효 — 기존 토큰 반환
  echo "$ACCESS_TOKEN"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: CLI refresh failed, using existing token (${REMAINING_MS}ms left)" >> "$LOG_FILE"
else
  # 토큰 만료 — 에러
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: EXPIRED token, CLI refresh failed. Run: claude setup-token" >> "$LOG_FILE"
  echo "TOKEN_EXPIRED" >&2
  exit 1
fi
