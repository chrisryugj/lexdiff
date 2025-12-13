# LexDiff - 한국 법령 비교 및 AI 검색 시스템

검색어만 입력하면 현행 조문 원문과 신·구법 대조를 한 화면에서 확인하고, **AI 자연어 검색**(Google File Search RAG)과 **3단 비교**(법률-시행령-시행규칙), **행정규칙 조회**까지 가능한 전문가용 법령 분석 도구입니다.

## 주요 기능

### 1. AI 자연어 검색 (Google File Search RAG)
- **자연어 질문으로 법령 검색**: "수출통관 시 필요한 서류는?", "청년 창업 지원 내용은?"
- **실시간 스트리밍 답변**: Google Gemini 2.5 Flash 기반 SSE 스트리밍
- **인용 출처 표시**: 답변 근거가 된 법령 조문 자동 링크 (클릭 시 모달)
- **통합 링크 시스템**: 모든 법령 참조를 클릭 가능한 링크로 변환
- **진행 상태 시각화**: 검색 → 분석 → 답변 생성 과정 실시간 표시

### 2. 법령 검색 및 조회
- 자유 텍스트 검색 (예: "관세법 38조", "관세법 제10조의2")
- 자동 조문 번호 정규화 및 JO 코드 변환
- 지방자치법규(조례/규칙) 검색 지원
- IndexedDB 기반 7일 캐시 (Phase 7)
- 레벤슈타인 거리 기반 유사도 매칭

### 3. 현행 법령 뷰어
- 조문별 네비게이션 트리
- 원문 그대로 표시
- 변경된 조문 시각적 강조
- 조·항·호 구조화된 표시
- 개정 이력 마커 스타일링 (`<개정>`, `[본조신설]`, `[종전~]`)

### 4. 3단 비교 시스템 (법률-시행령-시행규칙)
- **1단 뷰**: 법률 본문만 표시
- **2단 뷰**: 법률 + 시행령 좌우 비교
- **3단 뷰**: 법률 + 시행령 + 시행규칙 3열 비교
- 각 단별 독립 스크롤 (`calc(100vh - 250px)` 고정 높이)
- 자동 뷰 모드 전환 (데이터 유무에 따라)

### 5. 행정규칙 조회
- 조문별 관련 행정규칙 자동 검색 (훈령, 예규, 고시)
- **Optimistic UI**: 캐시된 데이터 즉시 표시 + 백그라운드 새로고침
- IndexedDB 영구 캐싱 (빠른 재로딩)
- HTTP 브라우저 캐싱 (계층: 1시간, 내용: 24시간)
- 병렬 API 호출로 성능 최적화
- Map 기반 중복 제거

### 6. 신·구법 대조
- 좌우 2열 비교 뷰
- 변경 사항 하이라이팅 (추가/삭제/수정)
- 동기화된 스크롤
- 메타데이터 표시 (시행일, 공포일/번호, 제개정구분)

### 7. AI 변경 요약
- Google Gemini 2.5 Flash 기반 자동 요약
- 핵심 변경점 3-5개 불릿 포인트
- 용어 변경 vs 실질 내용 변경 구분
- 요약 복사 기능

### 8. 즐겨찾기 & 디버그 콘솔
- 조문별 즐겨찾기 저장 (로컬 스토리지)
- 실시간 디버그 콘솔 (모든 API 호출, 파싱 과정, 오류 로깅)
- 기본 축소 상태

## 기술 스택

| Category | Technology |
|----------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript 5 |
| **UI** | Tailwind CSS v4, shadcn/ui, Radix UI |
| **AI** | Gemini 2.5 Flash (File Search RAG, 요약) |
| **API** | 법제처 법령 API (law.go.kr) - 49개 엔드포인트 |
| **State** | React Hooks + localStorage + IndexedDB |
| **Database** | Turso/LibSQL (학습 데이터) |
| **Caching** | HTTP Cache (1h/24h) + IndexedDB (7일 쿼리, 영구 행정규칙) |
| **Testing** | Vitest + Testing Library (293개 테스트) |
| **Security** | Rate Limiting 미들웨어 + Zod 입력 검증 + 보안 헤더 |
| **CI/CD** | GitHub Actions (테스트/빌드 자동화) |

## 설치 및 실행

### 환경 변수 설정

```bash
# Windows PowerShell
Copy-Item .env.local.example .env.local

# macOS/Linux
cp .env.local.example .env.local
```

`.env.local` 파일에 API 키 입력:
```
LAW_OC=your_law_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 개발 서버 실행

```bash
npm install
# or
pnpm install

npm run dev
```

브라우저에서 `http://localhost:3000` 접속

### 테스트 실행

```bash
# 단일 실행
pnpm test:run

# Watch 모드
pnpm test

# 커버리지 리포트
pnpm test:coverage
```

### 완전 클린 재시작 (Windows)

```bash
restart-server.cmd  # Node 프로세스 종료 + .next 캐시 삭제
```

## 환경 변수

- `LAW_OC`: 법제처 법령 API 인증키 (필수)
- `GEMINI_API_KEY`: Google Gemini API 키 (AI 기능 필수)

## 주요 아키텍처

### AI 검색 시스템

**Google File Search RAG**:
1. 사용자 자연어 질문 입력
2. Google Gemini File Search로 관련 법령 검색
3. 실시간 SSE 스트리밍으로 AI 답변 생성
4. Citation 클릭 → 모달로 법령 전문 표시

**핵심 구현**:
- SSE 버퍼 처리: 루프 종료 후 남은 버퍼 파싱으로 데이터 누락 방지
- 오버레이 프로그레스: `isAnalyzing` 단일 조건으로 진행 상태 유지
- XML/JSON 파싱: API 응답 형식별 올바른 파서 사용
- 모달 링크: 관련 법령을 모달로 열고 사이드바 자동 닫기

### 검색 시스템 (Phase 7)

**현재 활성화**:
- ✅ **Phase 7**: IndexedDB 쿼리 캐시 (7일, ~25ms)
- ✅ **기본 검색**: 레벤슈타인 거리 유사도 매칭 (85%/60% 적응형 임계값)

**일시 비활성화** (2025-11-11):
- ❌ **Phase 5**: Intelligent Search (학습 데이터 오염)
- ❌ **Phase 6**: Vector Search (Phase 5와 함께 비활성화)

**조문 자동 선택**: 요청 조문이 없을 경우 가장 유사한 조문 표시 + 배너 안내

### API 프록시 아키텍처

**Client → Next.js API Route → External API**

주요 엔드포인트:
- `/api/file-search-rag`: Google File Search RAG 스트리밍 (SSE)
- `/api/law-search`: 법령 검색 (XML)
- `/api/eflaw`: 현행 법령 조회 (JSON)
- `/api/oldnew`: 신·구법 대조 (XML)
- `/api/three-tier`: 3단 비교 (JSON)
- `/api/hierarchy`: 법령 체계도 + 행정규칙 목록 (XML)
- `/api/admrul`: 행정규칙 본문 (XML)
- `/api/summarize`: AI 변경 요약 (Gemini 2.5 Flash)

### 보안 아키텍처

**Rate Limiting** (`middleware.ts`):
| 엔드포인트 | 제한 | 윈도우 |
|-----------|------|--------|
| 일반 API (`/api/*`) | 100 req | 1분 |
| AI API (`/api/file-search-rag`, `/api/summarize`) | 20 req | 1분 |

- IP 기반 요청 제한 (Edge Runtime 메모리 저장소)
- 429 응답 시 `Retry-After` 헤더 제공
- `X-RateLimit-Remaining`, `X-RateLimit-Reset` 헤더

**입력 검증** (`lib/api-validation.ts`):
- Zod 스키마 기반 타입 안전 검증
- XSS 방지: HTML 태그, `javascript:` 프로토콜 제거
- 파라미터별 스키마: `searchQuerySchema`, `lawMstSchema`, `joCodeSchema`

**보안 헤더** (`next.config.mjs`):
- `X-Frame-Options: DENY` (클릭재킹 방지)
- `X-Content-Type-Options: nosniff` (MIME 스니핑 방지)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: 카메라/마이크/위치 비활성화

### JO 코드 시스템

6자리 조문 식별 코드:
- 형식: `AAAABB` (AAAA=조번호, BB=지번호)
- 예시: "제38조" → `003800`, "제10조의2" → `001002`
- 변환: `lib/law-parser.ts` (`buildJO()`, `formatJO()`)

## 프로젝트 구조

```
app/
├── page.tsx                    # 메인 페이지 (IndexedDB + History API)
├── api/                        # 49개 API 라우트
│   ├── file-search-rag/        # Google File Search RAG (SSE 스트리밍)
│   ├── eflaw/                  # 현행 법령 조회 (JSON)
│   ├── law-search/             # 법령 검색 (XML)
│   ├── three-tier/             # 3단 비교 (JSON)
│   ├── admrul/                 # 행정규칙 본문
│   ├── summarize/              # AI 변경 요약
│   └── admin/                  # Admin 관리 (28개 라우트)
components/
├── search-result-view.tsx      # 검색 결과 뷰 (메인 컴포넌트)
├── law-viewer.tsx              # 법령 뷰어 (3단 비교)
├── file-search-answer-display.tsx  # AI 답변 표시
├── reference-modal.tsx         # 법령 참조 모달
├── comparison-modal.tsx        # 신·구법 비교 모달
├── admin-rules-section.tsx     # 행정규칙 섹션 (Optimistic UI)
├── admin/                      # Admin 패널 컴포넌트
└── ui/                         # shadcn/ui 컴포넌트
lib/
├── unified-link-generator.ts   # 통합 링크 시스템 (핵심)
├── file-search-client.ts       # Google File Search 클라이언트
├── ai-answer-processor.ts      # AI 답변 HTML 변환
├── law-parser.ts               # JO 코드 파서
├── api-validation.ts           # Zod 기반 입력 검증
├── admin-rule-cache.ts         # IndexedDB 행정규칙 캐시
├── law-content-cache.ts        # IndexedDB 쿼리 캐시
└── favorites-store.ts          # 즐겨찾기 저장소 (pub/sub)
__tests__/
├── middleware.test.ts          # Rate Limiting 테스트 (30개)
└── lib/                        # 유닛 테스트 (263개)
    ├── law-parser.test.ts          # 86개
    ├── ai-answer-processor.test.ts # 77개
    ├── api-validation.test.ts      # 68개
    └── unified-link-generator.test.ts # 32개
hooks/
├── use-admin-rules.ts          # 행정규칙 상태 (Optimistic UI)
├── use-law-viewer-modals.ts    # 모달 상태
└── use-law-viewer-three-tier.ts # 3단 비교 상태
important-docs/                 # 핵심 구현 문서 (Claude Code용)
docs/                           # API, 배포, 설정 가이드
```

## 디버그 콘솔

화면 하단의 디버그 콘솔(기본 축소)에서 실시간 확인:
- 모든 API 호출 (URL, 파라미터, 응답)
- 파싱 과정 (XML/JSON 구조 분석)
- 오류 및 경고 (스택 트레이스 포함)
- AI 스트리밍 (청크 샘플, 토큰 사용량, finishReason)

## 라이선스

MIT

## 로컬 실행 가이드

- **Node.js 20 이상** 권장
- 환경 파일 복사:
  - Windows: `Copy-Item .env.local.example .env.local`
  - macOS/Linux: `cp .env.local.example .env.local`
- `.env.local` 값 채우기:
  - `LAW_OC`: law.go.kr API 키 (필수)
  - `GEMINI_API_KEY`: Google Gemini API 키 (필수)
- 패키지 설치: `pnpm install` 또는 `npm install`
- 개발 서버 실행: `pnpm dev` 또는 `npm run dev`
- 접속: `http://localhost:3000`

## 최근 주요 업데이트

### 2025-12-13: 테스트 인프라 대폭 강화, 보안 강화, CI/CD 구축
1. **Vitest 테스트 프레임워크 도입**: **293개 테스트 케이스** (153개 → 293개, +92%)
   - `law-parser`: 86개 (JO 코드, 검색어 파싱, 법령 추출)
   - `ai-answer-processor`: 77개 (마크다운 처리, 섹션 스타일링, 링크 생성)
   - `unified-link-generator`: 32개 (법령 링크 패턴)
   - `api-validation`: 68개 (Zod 스키마, XSS 방지)
   - `middleware`: 30개 (Rate Limiting)
2. **Rate Limiting 미들웨어**: 일반 API 100req/min, AI API 20req/min
3. **API 입력 검증**: Zod 스키마 기반 XSS 방지 및 파라미터 검증
4. **에러 바운더리 컴포넌트**: ErrorBoundary, AISearchErrorBoundary 추가
5. **보안 헤더 추가**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
6. **GitHub Actions CI/CD**: PR/Push 시 자동 테스트, 타입체크, 빌드 검증
7. **제N조의M 버그 수정**: 가지 조문 패턴 정규식 수정

### 2025-11-15: AI 검색 시스템 3대 핵심 수정
1. **SSE 스트리밍 버퍼 누락 수정**: 루프 종료 후 남은 버퍼 처리로 답변 잘림 방지
2. **API 파싱 오류 수정**: XML/JSON 응답 형식별 올바른 파서 적용으로 모달 빈 화면 해결
3. **프로그레스 오버레이 개선**: 스트리밍 중에도 진행 상태 유지로 UX 향상

### 2025-11-11: 검색 시스템 안정화
- Phase 5/6 일시 비활성화 (학습 데이터 오염 문제)
- Phase 7 조문 검증 버그 수정
- 레벤슈타인 거리 기반 유사도 매칭 도입

### 2025-11-05: 행정규칙 & 3단 비교 완전 구현
- 시행규칙 파싱 경로 수정
- 행정규칙 Map 기반 중복 제거
- 각 열 독립 스크롤 구현
