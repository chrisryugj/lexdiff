# 내일 작업 재개용 컨텍스트

## 오늘 완료한 작업 (2025-11-10)

### Phase 2-5 완료 ✅
**목표**: 검색 속도 400배 향상 (2000ms → 5ms), API 호출 95% 감소

#### Phase 1: Turso 데이터베이스 셋업
- Turso (LibSQL) 원격 DB 연결 완료
- 9개 테이블, 25개 인덱스 생성
- 환경변수: `.env.local`에 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 설정됨

#### Phase 2-4: Cascading Search Strategy
**5단계 폭포수 검색 전략**:
```
L1: 직접 매핑 (5ms) → L2: 변형 테이블 (5-10ms) →
L2: 유사 검색어 (10ms) → L3: 고품질 캐시 (30ms) →
L4: API 호출 (2000ms) + 자동 학습
```

**핵심 파일**:
- `lib/search-strategy.ts` - 5단계 검색 로직
- `lib/search-learning.ts` - 자동 학습 (성공한 API 호출 저장)
- `lib/variant-generator.ts` - 검색어 변형 생성
- `lib/variant-matcher.ts` - 유사 검색어 매칭
- `lib/search-integration.ts` - 기존 로직과 통합

#### Phase 5: User Feedback & Quality Scoring
**피드백 시스템**:
- 👍👎 버튼으로 검색 결과 평가
- Wilson Score Interval로 품질 점수 계산
- quality_score > 0.8인 결과는 L3 캐시 활성화

**핵심 파일**:
- `components/feedback-buttons.tsx` - 피드백 UI
- `app/api/feedback/route.ts` - 피드백 저장 API
- `lib/search-feedback-db.ts` - L3 캐시 검색 로직

#### 중요 아키텍처 결정
1. **클라이언트/서버 분리**:
   - DB 접근은 서버 사이드 API 라우트만 사용
   - `/api/intelligent-search` - 검색
   - `/api/search-learning` - 학습
   - `/api/feedback` - 피드백

2. **자동 학습**:
   - 성공한 API 호출 자동 저장
   - 검색어 변형 자동 생성
   - 품질 점수 자동 업데이트

---

## 다음 작업: Phase 6-8 (자연어 검색)

### 목표
"수입물품에 대한 세금은 어떻게 부과되나요?" → **관세법 38조** 자동 매칭

### 구현 계획

#### Phase 6: Vector Embedding (Voyage AI)
**목표**: 법령 조문을 벡터로 변환하여 의미 기반 검색 가능하게 함

**예상 작업**:
1. Voyage AI API 연동 (`VOYAGE_API_KEY`)
2. 법령 데이터 임베딩 생성
   - 법령명 + 조문 번호 + 조문 내용 → 벡터 (1024 차원)
3. Turso DB에 벡터 저장
   - 테이블: `law_embeddings` (law_id, article_jo, embedding_vector, metadata)
4. 벡터 유사도 검색 함수 구현

**Voyage AI 스펙**:
- Free tier: 200M tokens/month
- 모델: `voyage-law-2` (법률 특화) 또는 `voyage-3`
- 비용: $0.12 per 1M tokens (입력)

#### Phase 7: RAG (Retrieval-Augmented Generation)
**목표**: 자연어 쿼리를 임베딩으로 변환하여 유사 법령 검색

**예상 작업**:
1. 사용자 쿼리 임베딩 생성
2. 코사인 유사도로 top-k 법령 검색
3. 검색 결과 리랭킹 (선택적)
4. L0 레이어로 통합 (자연어 검색이 최우선)

#### Phase 8: Natural Language Query Parsing
**목표**: 검색창에서 자연어 입력 지원

**예상 작업**:
1. 자연어 감지 로직 (키워드 vs 자연어)
2. 검색 전략 분기:
   - 키워드 검색 (기존): L1~L4
   - 자연어 검색 (신규): L0 (벡터 검색) → L1~L4 (폴백)
3. UI 개선:
   - 검색 타입 토글 (키워드 / 자연어)
   - 자연어 검색 예시 제공

---

## 내일 시작 프롬프트

```
Phase 6-8 (자연어 검색) 구현 시작하자.

먼저 Voyage AI 계정 설정부터 해야 할 것 같은데,
다음 순서로 진행해줘:

1. Voyage AI API 키 발급 가이드
2. .env.local에 환경변수 추가
3. Voyage AI SDK 설치 및 테스트 연결
4. 법령 데이터 임베딩 생성 스크립트 작성
5. Turso DB에 벡터 저장 테이블 추가

진행하면서 중요한 결정사항 있으면 물어보고,
단계별로 착착 진행해줘.
```

---

## 현재 시스템 상태

### 환경변수 (`.env.local`)
```
LAW_OC=ryuseungin
GEMINI_API_KEY=AIzaSyA...
TURSO_DATABASE_URL=libsql://lexdiff-feedback-chrisryugj.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=eyJhbGc...
```

### 개발 서버
```bash
npm run dev  # http://localhost:3000
```

### DB 확인 명령어
```bash
# 저장된 매핑 확인
npx tsx scripts/check-tables.ts

# 품질 점수 확인
npx tsx -e "import('./lib/db.js').then(async ({query}) => {
  const result = await query(\`
    SELECT sr.law_title, sqs.quality_score, sqs.positive_count
    FROM search_quality_scores sqs
    JOIN search_results sr ON sqs.search_result_id = sr.id
    ORDER BY sqs.quality_score DESC LIMIT 5
  \`)
  console.table(result.rows)
  process.exit(0)
})"
```

---

## 문제 해결 참고

### Phase 2-5 구현 시 발생했던 이슈
1. **브라우저에서 DB 접근 에러**:
   - 해결: API 라우트로 분리
   - 파일: `/api/intelligent-search`, `/api/search-learning`, `/api/feedback`

2. **Turso 환경변수 로딩 실패**:
   - 해결: `lib/db.ts`에서 dotenv 직접 로딩
   - `require('dotenv').config({ path: '.env.local' })`

3. **Migration API 에러 (400)**:
   - 해결: `@libsql/client` 버전 업데이트 (0.6.2 → 0.15.15)

---

**수고했어! 내일 Phase 6-8로 자연어 검색 구현하자!** 🚀
