# 검색 피드백 학습 시스템 문서

> LexDiff 검색 품질 향상을 위한 완전한 구현 가이드

---

## 📚 문서 구조

### 1. [구현 계획 (메인)](./SEARCH_FEEDBACK_IMPLEMENTATION_PLAN.md)
**읽기 순서: 1번째**

전체 프로젝트 개요, 아키텍처, 로드맵을 포함한 메인 문서

**포함 내용**:
- 프로젝트 목표 및 현재 문제점
- 5단계 Fallback 검색 전략
- 기술 스택 선정 이유
- Phase별 구현 로드맵 (11단계)
- 성능 목표 및 비용 분석
- 위험 요소 및 대응 방안

**이 문서부터 읽으세요!**

---

### 2. [데이터베이스 스키마](./DATABASE_SCHEMA.md)
**읽기 순서: 2번째**

전체 데이터베이스 테이블 정의 및 마이그레이션 SQL

**포함 내용**:
- 14개 테이블 스키마 (SQL)
- 인덱스 및 트리거 정의
- 마이그레이션 파일 구조
- 데이터 검증 쿼리

**Phase 1 시작 전 필독**

---

### 3. [코드 예시](./CODE_EXAMPLES.md)
**읽기 순서: 3번째**

각 Phase별 핵심 구현 코드

**포함 내용**:
- `lib/db.ts` - Turso 클라이언트
- `lib/search-feedback-db.ts` - 쿼리 함수
- `lib/search-strategy.ts` - 통합 검색 전략
- `lib/variant-generator.ts` - 유사 검색어 생성
- `lib/embedding.ts` - 벡터 임베딩
- `components/search-feedback-button.tsx` - 피드백 UI
- `app/api/feedback/route.ts` - 피드백 API

**코딩 시작 시 참고**

---

### 4. [API 연동 가이드](./API_INTEGRATION.md)
**읽기 순서: 4번째**

Turso, Voyage AI 설정 방법

**포함 내용**:
- Turso CLI 설치 및 DB 생성
- Voyage AI API 키 발급
- 환경변수 설정
- 연결 테스트 방법
- Edge Replicas 설정 (선택)
- 트러블슈팅

**Phase 1, 6 시작 전 필독**

---

### 5. [배포 가이드](./DEPLOYMENT_GUIDE.md)
**읽기 순서: 5번째**

실제 배포 및 운영 가이드

**포함 내용**:
- Phase별 배포 절차
- 로컬 테스트 방법
- Vercel 프로덕션 배포
- 모니터링 및 최적화
- 백업 및 롤백 계획
- 문제 해결 가이드

**배포 직전 필독**

---

## 🚀 빠른 시작

### 1. 전체 계획 파악 (30분)

```bash
# 메인 문서 읽기
cat docs/SEARCH_FEEDBACK_IMPLEMENTATION_PLAN.md
```

주요 확인 사항:
- ✅ 5단계 검색 전략 이해
- ✅ Phase별 로드맵 확인
- ✅ 무료 운영 가능 여부 확인

---

### 2. Phase 1 시작 (1일)

**A. 환경 설정**
```bash
# API_INTEGRATION.md 참고
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create lexdiff-feedback
```

**B. 스키마 마이그레이션**
```bash
# DATABASE_SCHEMA.md 참고
turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql
turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql
```

**C. 코드 구현**
```bash
# CODE_EXAMPLES.md 참고
# lib/db.ts 생성
# lib/search-feedback-db.ts 생성
```

**D. 배포 및 테스트**
```bash
# DEPLOYMENT_GUIDE.md 참고
pnpm dev
# 검색 테스트
```

---

### 3. Phase 2-5 진행 (1주)

각 Phase별로 위 과정 반복:
1. 구현 계획 확인
2. 코드 작성
3. 테스트
4. 배포

---

## 📊 진행 상황 체크리스트

### Phase 1: Turso 기본 설정
- [ ] Turso 계정 생성
- [ ] DB 생성 및 연결
- [ ] 기본 스키마 마이그레이션
- [ ] `lib/db.ts` 구현
- [ ] 연결 테스트 성공

### Phase 2-4: 검색 전략
- [ ] API 매핑 테이블 생성
- [ ] 유사 검색어 생성 로직
- [ ] 5단계 fallback 구현
- [ ] 기존 검색 흐름 통합
- [ ] 전략별 성능 로깅

### Phase 5: 피드백 UI
- [ ] SearchFeedbackButton 컴포넌트
- [ ] `/api/feedback` 엔드포인트
- [ ] law-viewer 통합
- [ ] 품질 점수 자동 업데이트
- [ ] 피드백 수집 확인

### Phase 6-8: 벡터 DB (선택)
- [ ] Voyage AI 계정 생성
- [ ] 벡터 스키마 마이그레이션
- [ ] 임베딩 생성 시스템
- [ ] L0 벡터 검색 레이어
- [ ] 법령 조문 임베딩
- [ ] RAG 파이프라인
- [ ] 자연어 검색 UI

---

## 🎯 성공 기준

### 기본 목표 (Phase 1-5)
- ✅ 검색 속도 < 50ms (캐시 히트 시)
- ✅ API 호출 50% 이하
- ✅ 피드백 수집 작동
- ✅ 무료 운영

### 최종 목표 (Phase 6-8)
- ✅ 검색 속도 < 10ms (벡터 히트 시)
- ✅ API 호출 5% 이하
- ✅ 자연어 검색 지원
- ✅ RAG 질의응답

---

## 📞 지원

### 문서 관련
- 각 문서 하단의 "참고 자료" 섹션 확인
- 구현 중 막히면 CODE_EXAMPLES.md의 전체 코드 참고

### 기술 지원
- Turso: https://docs.turso.tech/
- Voyage AI: https://docs.voyageai.com/
- LibSQL Vector: https://turso.tech/vector

---

## 📝 업데이트 이력

- **2025-11-05**: 초기 문서 작성
  - 전체 구현 계획 완성
  - 14개 테이블 스키마 정의
  - Phase 1-8 코드 예시 작성
  - 배포 가이드 완성

---

**시작하기**: [SEARCH_FEEDBACK_IMPLEMENTATION_PLAN.md](./SEARCH_FEEDBACK_IMPLEMENTATION_PLAN.md)를 먼저 읽으세요!
