# LexDiff 검색 피드백 시스템 구현 시작 프롬프트

> **복사해서 새 Claude 세션에 붙여넣기**

---

## 프로젝트 컨텍스트

LexDiff는 한국 법령 비교 시스템입니다. 현재 검색 결과를 학습하는 시스템을 구현하려고 합니다.

### 현재 상황
- ✅ 구현 계획 문서 완성 (6개 파일)
- ✅ 데이터베이스 스키마 설계 완료 (14개 테이블)
- ✅ 코드 예시 작성 완료
- 🎯 **다음 단계**: Phase 1 구현 시작 (Turso 설정 및 기본 스키마)

### 문서 위치
```
/home/user/lexdiff/docs/
├── README.md                                    # 📍 시작점
├── SEARCH_FEEDBACK_IMPLEMENTATION_PLAN.md       # 📋 전체 계획
├── DATABASE_SCHEMA.md                           # 🗄️ DB 스키마
├── CODE_EXAMPLES.md                             # 💻 코드 예시
├── API_INTEGRATION.md                           # 🔌 API 설정
└── DEPLOYMENT_GUIDE.md                          # 🚀 배포 가이드
```

---

## 핵심 목표

1. **검색 속도 400배 향상**: 2000ms → 5ms
2. **API 호출 95% 감소**: 캐싱 및 직접 매핑
3. **무료 운영**: Turso (5GB) + Voyage AI (200M 토큰)
4. **사용자 피드백 학습**: 👍/👎로 품질 개선
5. **자연어 검색 지원**: RAG 기반 질의응답 (Phase 6+)

---

## 5단계 검색 전략

```
L0: 벡터 유사도 검색 (~5ms, 95% 정확도)
  ↓ MISS
L1: 직접 API 매핑 (~5ms, 90% 정확도)
  ↓ MISS
L2: 유사 검색어 매칭 (~10ms, 85% 정확도)
  ↓ MISS
L3: 고품질 캐시 (~30ms, 80% 정확도)
  ↓ MISS
L4: API 호출 (500-2000ms, 100% 정확도)
  ↓
자동 학습 및 임베딩 생성
```

---

## 기술 스택

| 항목 | 선택 | 무료 티어 | 이유 |
|------|------|----------|------|
| **데이터베이스** | Turso (LibSQL) | 5GB, 500M reads/월 | 벡터 검색 내장, Edge 복제, Compute time 무제한 |
| **벡터 임베딩** | Voyage AI | 200M 토큰 무료 | 512차원, 55년 사용 가능 |
| **LLM** | Gemini 2.5 Flash | 기존 사용 중 | 이미 통합됨 |

---

## 구현 로드맵

### Phase 1: Turso 기본 설정 (1일) 🎯 **지금 여기**
- [ ] Turso DB 생성 및 연결
- [ ] 기본 스키마 마이그레이션 (5개 테이블)
- [ ] `lib/db.ts` 구현
- [ ] 연결 테스트

### Phase 2-4: 검색 전략 (3일)
- [ ] API 파라미터 직접 매핑
- [ ] 유사 검색어 자동 생성
- [ ] 5단계 fallback 통합

### Phase 5: 피드백 UI (1일)
- [ ] 👍/👎 버튼 컴포넌트
- [ ] 품질 점수 자동 업데이트

### Phase 6-8: 벡터 DB (선택, 4-6일)
- [ ] Voyage AI 연동
- [ ] 벡터 검색 레이어
- [ ] RAG 자연어 질의응답

---

## 중요 제약사항

1. **무료 운영 필수**: 모든 선택은 무료 티어 기준
2. **Git 브랜치**: `claude/law-search-feedback-db-011CUpgMo5QrVCcdQnh9BaZu`
3. **환경변수 필요**:
   ```bash
   TURSO_DATABASE_URL=
   TURSO_AUTH_TOKEN=
   VOYAGE_API_KEY=  # Phase 6부터
   ```

---

## 바로 시작하기

### 1. 문서 읽기 (10분)
```bash
cd /home/user/lexdiff
cat docs/README.md
cat docs/DEPLOYMENT_GUIDE.md  # Phase 1 섹션
```

### 2. Turso 설정 (20분)
```bash
# CLI 설치
curl -sSfL https://get.tur.so/install.sh | bash

# 로그인 및 DB 생성
turso auth login
turso db create lexdiff-feedback

# 연결 정보 확인
turso db show lexdiff-feedback --url
turso db tokens create lexdiff-feedback

# 환경변수 설정
echo "TURSO_DATABASE_URL=..." >> .env.local
echo "TURSO_AUTH_TOKEN=..." >> .env.local
```

### 3. 스키마 마이그레이션 (10분)
```bash
# SQL 파일 준비
cat docs/DATABASE_SCHEMA.md  # 001, 002 섹션 복사

# 마이그레이션 실행
turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql
turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql

# 검증
turso db shell lexdiff-feedback "SELECT name FROM sqlite_master WHERE type='table';"
```

### 4. 코드 구현 (30분)
```bash
# CODE_EXAMPLES.md의 코드 복사
touch lib/db.ts
touch lib/search-feedback-db.ts

# 테스트
pnpm dev
```

---

## 작업 요청 예시

### Phase 1 시작
```
Phase 1을 시작합니다.
1. lib/db.ts를 CODE_EXAMPLES.md 기반으로 생성해주세요
2. lib/search-feedback-db.ts의 기본 함수들을 구현해주세요
3. 연결 테스트 코드를 작성해주세요
```

### Phase 2-4 진행
```
Phase 2를 시작합니다.
1. lib/search-strategy.ts를 구현해주세요 (5단계 fallback)
2. lib/variant-generator.ts를 구현해주세요 (유사 검색어 생성)
3. app/page.tsx의 handleSearch를 intelligentSearch()로 교체해주세요
```

### Phase 5 UI
```
Phase 5를 시작합니다.
1. components/search-feedback-button.tsx 컴포넌트를 만들어주세요
2. app/api/feedback/route.ts 엔드포인트를 만들어주세요
3. components/law-viewer.tsx에 피드백 버튼을 통합해주세요
```

---

## 현재 프로젝트 상태

### 기존 기능
- ✅ 법령 검색 및 조회
- ✅ 구법/신법 비교
- ✅ 3단 비교 (법-시행령-시행규칙)
- ✅ 행정규칙 검색 (캐싱)
- ✅ AI 요약 (Gemini)
- ✅ 즐겨찾기
- ✅ 최근 검색 (5개)

### 개선 대상
- ❌ 검색 결과가 1시간 후 만료
- ❌ 매번 API 재호출 (느림)
- ❌ 품질 측정 불가
- ❌ 학습 불가능
- ❌ 자연어 미지원

### 개선 후
- ✅ 영구 저장 (Turso)
- ✅ 5ms 응답 (95% 캐시)
- ✅ 품질 점수 (피드백 기반)
- ✅ 자동 학습
- ✅ 자연어 질의응답

---

## 참고 자료

- [Turso Docs](https://docs.turso.tech/)
- [Voyage AI Docs](https://docs.voyageai.com/)
- [LibSQL Vector Search](https://turso.tech/blog/turso-brings-native-vector-search-to-sqlite)

---

## 질문 예시

### 진행 중 막히면
```
[문제 상황 설명]
- 어떤 Phase 작업 중인지
- 어떤 에러가 발생했는지
- 관련 로그나 코드

docs/DEPLOYMENT_GUIDE.md의 트러블슈팅 섹션을 확인했나요?
```

### 다음 단계 확인
```
Phase [N]이 완료되었습니다.
1. 테스트는 어떻게 하나요?
2. 다음 Phase [N+1]을 시작해도 되나요?
3. 현재까지의 성과를 확인하고 싶습니다
```

---

## 성공 기준 (Phase 1-5 완료 후)

- ✅ 검색 속도 < 50ms (L1-L3 히트 시)
- ✅ API 호출 비율 < 50%
- ✅ 피드백 수집 작동
- ✅ 품질 점수 자동 업데이트
- ✅ 무료 티어로 운영 중

---

**준비 완료! 이제 Phase 1을 시작하세요.** 🚀
