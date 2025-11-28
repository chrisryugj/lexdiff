# Phase 1: Turso 데이터베이스 설정 가이드

## 완료된 작업

### 1. 코드 파일 생성 완료
- `lib/db.ts` - Turso 클라이언트 연결
- `lib/search-feedback-db.ts` - 핵심 데이터베이스 함수들
- `db/migrations/001_basic_schema.sql` - 기본 스키마 (5개 테이블)
- `db/migrations/002_mapping_schema.sql` - 매핑 스키마 (4개 테이블)
- `scripts/test-db-connection.ts` - DB 연결 테스트 스크립트
- `.env.local.turso.example` - 환경변수 예시

### 2. 패키지 설정
- `package.json`에 `@libsql/client` 의존성 추가 완료

## 다음 단계: Turso 설정

### Step 1: Turso CLI 설치
```bash
# Windows (PowerShell)
iwr https://get.turso.tech/install.ps1 -useb | iex

# macOS/Linux
curl -sSfL https://get.tur.so/install.sh | bash
```

### Step 2: Turso 계정 설정
```bash
# 로그인 (브라우저 창이 열립니다)
turso auth login

# 계정 확인
turso auth whoami
```

### Step 3: 데이터베이스 생성
```bash
# 데이터베이스 생성
turso db create lexdiff-feedback

# 연결 정보 확인
turso db show lexdiff-feedback --url

# 인증 토큰 생성
turso db tokens create lexdiff-feedback
```

### Step 4: 환경변수 설정
`.env.local` 파일에 다음 내용 추가:
```
TURSO_DATABASE_URL=libsql://lexdiff-feedback-[your-org].turso.io
TURSO_AUTH_TOKEN=eyJ... (위에서 생성한 토큰)
```

### Step 5: 스키마 마이그레이션
```bash
# 기본 스키마 적용 (5개 테이블)
turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql

# 매핑 스키마 적용 (4개 테이블)
turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql

# 테이블 확인
turso db shell lexdiff-feedback "SELECT name FROM sqlite_master WHERE type='table';"
```

예상 결과:
- search_queries
- search_results
- delegation_connections
- user_feedback
- search_quality_scores
- api_parameter_mappings
- similar_query_groups
- query_variants
- search_strategy_logs

### Step 6: 연결 테스트
```bash
# TypeScript 실행
npx tsx scripts/test-db-connection.ts

# 또는 Node.js로 직접 실행 (컴파일 필요)
npx tsc scripts/test-db-connection.ts --outDir scripts
node scripts/test-db-connection.js
```

## 구현된 주요 함수들

### lib/search-feedback-db.ts
- `recordSearchQuery()` - 검색 쿼리 기록
- `recordSearchResult()` - 검색 결과 저장
- `recordApiMapping()` - API 파라미터 매핑 저장
- `searchDirectMapping()` - 직접 매핑 검색
- `recordUserFeedback()` - 사용자 피드백 저장
- `updateQualityScore()` - 품질 점수 자동 업데이트
- `recordStrategyLog()` - 검색 전략 로그 기록
- `getSessionSearchHistory()` - 세션별 검색 기록 조회

## 문제 해결

### npm 설치 오류
```bash
# package-lock.json 삭제 후 재설치
rm package-lock.json
npm install --legacy-peer-deps
```

### Turso 연결 오류
1. 환경변수 확인: `.env.local` 파일에 `TURSO_DATABASE_URL`과 `TURSO_AUTH_TOKEN` 존재 여부
2. 토큰 재생성: `turso db tokens create lexdiff-feedback`
3. DB 상태 확인: `turso db list`

### 테이블 없음 오류
마이그레이션 파일 다시 실행:
```bash
turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql
turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql
```

## 검증 체크리스트

- [ ] Turso CLI 설치 완료
- [ ] Turso 계정 로그인 완료
- [ ] 데이터베이스 생성 완료
- [ ] 환경변수 설정 완료
- [ ] 스키마 마이그레이션 완료
- [ ] 연결 테스트 성공
- [ ] 9개 테이블 모두 생성 확인

## 다음: Phase 2-4
Phase 1이 완료되면 검색 전략 구현 단계로 진행:
- `lib/search-strategy.ts` - 통합 검색 전략
- `lib/variant-generator.ts` - 검색어 변형 생성
- `lib/variant-matcher.ts` - 유사 검색어 매칭
- `app/page.tsx` 통합