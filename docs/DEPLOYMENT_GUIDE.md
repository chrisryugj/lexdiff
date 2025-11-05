# 배포 가이드

> **작성일**: 2025-11-05
> **대상**: LexDiff 검색 피드백 시스템

---

## 사전 준비

### 1. 환경 확인

- Node.js 20+
- pnpm (권장) 또는 npm
- Turso CLI 설치됨
- 환경변수 설정 완료

### 2. 의존성 설치

```bash
cd /home/user/lexdiff
pnpm install
pnpm add @libsql/client
```

---

## Phase 1: Turso 기본 설정

### 1단계: DB 생성 및 연결

```bash
# DB 생성
turso db create lexdiff-feedback

# 연결 정보 복사
turso db show lexdiff-feedback --url
turso db tokens create lexdiff-feedback

# .env.local 업데이트
echo "TURSO_DATABASE_URL=..." >> .env.local
echo "TURSO_AUTH_TOKEN=..." >> .env.local
```

### 2단계: DB 클라이언트 생성

```bash
# lib/db.ts 생성
```

```typescript
import { createClient } from '@libsql/client'

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

export async function query(sql: string, params?: any[]) {
  return db.execute({ sql, args: params || [] })
}

export async function queryOne(sql: string, params?: any[]) {
  const result = await query(sql, params)
  return result.rows[0] || null
}

export async function queryAll(sql: string, params?: any[]) {
  const result = await query(sql, params)
  return result.rows
}
```

### 3단계: 마이그레이션 실행

```bash
# 마이그레이션 파일 준비
mkdir -p db/migrations
```

DATABASE_SCHEMA.md의 SQL을 각 파일로 저장:
- `db/migrations/001_basic_schema.sql`
- `db/migrations/002_mapping_schema.sql`
- `db/migrations/003_vector_schema.sql`

```bash
# 실행
turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql
turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql

# 벡터 스키마는 Phase 6에서
# turso db shell lexdiff-feedback < db/migrations/003_vector_schema.sql
```

### 4단계: 검증

```bash
turso db shell lexdiff-feedback "SELECT name FROM sqlite_master WHERE type='table';"
```

예상 출력:
```
search_queries
search_results
delegation_connections
user_feedback
search_quality_scores
api_parameter_mappings
similar_query_groups
query_variants
search_strategy_logs
```

---

## Phase 2-4: 검색 전략 구현

### 파일 생성

```bash
mkdir -p lib
touch lib/search-feedback-db.ts
touch lib/search-learning.ts
touch lib/variant-generator.ts
touch lib/variant-matcher.ts
touch lib/search-strategy.ts
```

각 파일에 CODE_EXAMPLES.md의 코드 복사

### 기존 검색 흐름 통합

`app/page.tsx` 수정:

```typescript
import { intelligentSearch } from '@/lib/search-strategy'

// 기존 handleSearch 함수 교체
const handleSearch = async (query: string) => {
  setLoading(true)

  try {
    // 새로운 통합 검색 사용
    const result = await intelligentSearch(query)

    console.log(`검색 완료: ${result.source} (${result.time}ms)`)

    // 기존 로직 유지
    setLawData(result.data)
    setSearchResultId(result.data.searchResultId)

  } catch (error) {
    console.error('검색 실패:', error)
  } finally {
    setLoading(false)
  }
}
```

---

## Phase 5: 피드백 UI

### 1단계: 컴포넌트 생성

```bash
touch components/search-feedback-button.tsx
```

CODE_EXAMPLES.md의 코드 복사

### 2단계: API 엔드포인트 생성

```bash
mkdir -p app/api/feedback
touch app/api/feedback/route.ts
```

CODE_EXAMPLES.md의 코드 복사

### 3단계: UI 통합

`components/law-viewer.tsx` 수정:

```typescript
import { SearchFeedbackButton } from './search-feedback-button'

// 법령 제목 옆에 추가
<div className="flex justify-between items-center">
  <h2>{lawTitle}</h2>

  {searchResultId && (
    <SearchFeedbackButton searchResultId={searchResultId} />
  )}
</div>
```

---

## Phase 6: 벡터 DB (선택)

### 1단계: Voyage AI 설정

```bash
# .env.local
VOYAGE_API_KEY=pa-your-key
```

### 2단계: 벡터 스키마 마이그레이션

```bash
turso db shell lexdiff-feedback < db/migrations/003_vector_schema.sql
```

### 3단계: 임베딩 시스템 구현

```bash
touch lib/embedding.ts
touch lib/vector-search.ts
```

CODE_EXAMPLES.md의 코드 복사

---

## 테스트

### 로컬 테스트

```bash
pnpm dev
```

1. 검색 테스트: "관세법 38조"
2. 피드백 테스트: 👍/👎 클릭
3. DB 확인:
   ```bash
   turso db shell lexdiff-feedback "SELECT COUNT(*) FROM search_queries;"
   ```

### 검색 전략 확인

브라우저 콘솔에서:
```
검색 완료: L1_mapping (5ms)  ← 직접 매핑 성공
검색 완료: L2_variant (10ms)  ← 유사 검색어
검색 완료: L4_api (1234ms)   ← API 호출 (새로운 검색)
```

---

## 프로덕션 배포

### Vercel 배포

```bash
# 환경변수 설정 (Vercel Dashboard)
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN
vercel env add VOYAGE_API_KEY
vercel env add LAW_OC
vercel env add GEMINI_API_KEY

# 배포
vercel --prod
```

### 배포 후 확인

1. **검색 기능**: 정상 작동 확인
2. **피드백**: 👍/👎 저장 확인
3. **DB 연결**: Turso 대시보드에서 Reads/Writes 증가 확인
4. **성능**: 브라우저 Network 탭에서 응답 시간 확인

---

## 모니터링

### 일일 체크

```bash
# 검색 통계
turso db shell lexdiff-feedback "
  SELECT
    DATE(created_at) as date,
    COUNT(*) as total_searches
  FROM search_queries
  GROUP BY DATE(created_at)
  ORDER BY date DESC
  LIMIT 7;
"

# 전략별 히트율
turso db shell lexdiff-feedback "
  SELECT
    strategy_used,
    COUNT(*) as count,
    AVG(total_time_ms) as avg_time
  FROM search_strategy_logs
  WHERE created_at > datetime('now', '-1 day')
  GROUP BY strategy_used;
"
```

### 주간 체크

1. **Turso 사용량**: https://turso.tech/app
2. **Voyage AI 사용량**: https://www.voyageai.com/dashboard
3. **피드백 통계**:
   ```sql
   SELECT
     feedback_type,
     COUNT(*) as count
   FROM user_feedback
   WHERE created_at > datetime('now', '-7 days')
   GROUP BY feedback_type;
   ```

---

## 최적화

### 캐시 히트율 개선

1. **검증된 매핑 확인**:
   ```sql
   SELECT COUNT(*) FROM api_parameter_mappings WHERE is_verified = 1;
   ```

2. **저품질 매핑 정리**:
   ```sql
   DELETE FROM api_parameter_mappings
   WHERE quality_score < 0.3
     AND created_at < datetime('now', '-30 days');
   ```

3. **유사 검색어 통합**:
   수동으로 중복 그룹 병합

---

## 백업

### 정기 백업 (권장: 주 1회)

```bash
# 전체 DB 덤프
turso db shell lexdiff-feedback .dump > backup-$(date +%Y%m%d).sql

# S3 또는 로컬 저장소에 보관
```

### 복구

```bash
turso db shell lexdiff-feedback < backup-20250101.sql
```

---

## 롤백 계획

Phase별 롤백 방법:

### Phase 5 롤백 (피드백 UI 제거)

```typescript
// components/law-viewer.tsx
// SearchFeedbackButton 제거
```

### Phase 2-4 롤백 (통합 검색 제거)

```typescript
// app/page.tsx
// intelligentSearch() → 기존 fetchLawData() 복구
```

### Phase 1 롤백 (Turso 제거)

```bash
# 환경변수 삭제
# lib/db.ts 삭제
# 기존 localStorage/HTTP 캐시로 복구
```

---

## 문제 해결

### 검색이 느려짐

1. 전략 로그 확인:
   ```sql
   SELECT * FROM search_strategy_logs ORDER BY created_at DESC LIMIT 100;
   ```

2. API 호출 비율 확인:
   ```sql
   SELECT
     strategy_used,
     COUNT(*) * 100.0 / (SELECT COUNT(*) FROM search_strategy_logs) as percentage
   FROM search_strategy_logs
   GROUP BY strategy_used;
   ```

3. 인덱스 재구축:
   ```sql
   REINDEX;
   ```

### 피드백 저장 안됨

1. API 엔드포인트 확인: `/api/feedback`
2. 브라우저 콘솔 에러 확인
3. 세션 ID 생성 확인

---

## 성공 기준

### Phase 1-5 완료 후

- ✅ 검색 속도 < 50ms (L1-L3 히트 시)
- ✅ API 호출 비율 < 50%
- ✅ 피드백 수집 정상 작동
- ✅ 품질 점수 자동 업데이트

### Phase 6-8 완료 후

- ✅ 검색 속도 < 10ms (L0 벡터 히트 시)
- ✅ API 호출 비율 < 10%
- ✅ 자연어 검색 지원
- ✅ RAG 질의응답 작동

---

**다음**: [SEARCH_FEEDBACK_IMPLEMENTATION_PLAN.md](./SEARCH_FEEDBACK_IMPLEMENTATION_PLAN.md) 참고
