# 외부 API 연동 가이드

> **작성일**: 2025-11-05
> **대상 API**: Turso, Voyage AI

---

## Turso 설정

### 1. Turso CLI 설치

```bash
# macOS/Linux
curl -sSfL https://get.tur.so/install.sh | bash

# Windows (PowerShell)
irm get.tur.so/install.ps1 | iex
```

### 2. 계정 생성 및 로그인

```bash
turso auth login
```

브라우저가 열리면 GitHub로 로그인

### 3. 데이터베이스 생성

```bash
turso db create lexdiff-feedback
```

### 4. 연결 정보 확인

```bash
# DB URL 확인
turso db show lexdiff-feedback --url

# 토큰 생성
turso db tokens create lexdiff-feedback
```

### 5. 환경변수 설정

```bash
# .env.local
TURSO_DATABASE_URL=libsql://lexdiff-feedback-[your-username].turso.io
TURSO_AUTH_TOKEN=eyJh... (긴 토큰 문자열)
```

### 6. 연결 테스트

```bash
turso db shell lexdiff-feedback

# 셸에서
sqlite> SELECT 1;
1
sqlite> .exit
```

---

## Voyage AI 설정

### 1. 계정 생성

https://www.voyageai.com/ 접속 → Sign Up

### 2. API 키 발급

Dashboard → API Keys → Create API Key

### 3. 환경변수 설정

```bash
# .env.local
VOYAGE_API_KEY=pa-... (시작하는 키)
```

### 4. 테스트 요청

```bash
curl https://api.voyageai.com/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VOYAGE_API_KEY" \
  -d '{
    "input": "관세법 제38조",
    "model": "voyage-3-lite"
  }'
```

성공 응답:
```json
{
  "data": [
    {
      "embedding": [0.123, -0.456, ...],
      "index": 0
    }
  ],
  "model": "voyage-3-lite",
  "usage": {
    "total_tokens": 5
  }
}
```

---

## 패키지 설치

```bash
pnpm add @libsql/client
```

---

## 환경변수 전체 목록

```bash
# .env.local (필수)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

VOYAGE_API_KEY=pa-your-key

# 기존 환경변수 (유지)
LAW_OC=your-law-api-key
GEMINI_API_KEY=your-gemini-key
```

---

## Turso Edge Replicas (선택)

전 세계 빠른 응답을 위해 리전별 복제본 생성

```bash
# 서울 리전 복제
turso db replicate lexdiff-feedback icn

# 도쿄 리전 복제
turso db replicate lexdiff-feedback nrt

# 미국 서부 복제
turso db replicate lexdiff-feedback lax
```

클라이언트는 자동으로 가장 가까운 리전 사용

---

## 사용량 모니터링

### Turso 대시보드

https://turso.tech/app → 데이터베이스 선택 → Usage

확인 항목:
- 저장공간 사용량
- Reads/Writes 사용량
- 리전별 트래픽

### Voyage AI 대시보드

https://www.voyageai.com/dashboard → Usage

확인 항목:
- 사용된 토큰 수
- 남은 무료 티어

---

## 트러블슈팅

### Turso 연결 오류

```
Error: unable to open database
```

해결:
1. `TURSO_DATABASE_URL` 확인 (libsql:// 프로토콜)
2. `TURSO_AUTH_TOKEN` 재생성
3. 방화벽 확인

### Voyage AI 401 Unauthorized

```
{"error": "Invalid API key"}
```

해결:
1. API 키 재확인 (pa-로 시작)
2. 환경변수 재시작 필요 (서버 재시작)
3. 키 재발급

### 무료 티어 초과

Turso:
```
Error: storage limit exceeded
```

Voyage AI:
```
{"error": "Rate limit exceeded"}
```

해결:
1. 사용량 확인
2. 오래된 데이터 정리
3. Pro 플랜 고려
