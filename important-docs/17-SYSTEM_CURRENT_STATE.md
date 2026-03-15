# LexDiff 프로젝트 현황 분석 (2026-03-15 기준)

한국 법령 비교 + AI 검색 시스템 — 법제처 API + FC-RAG (Function Calling RAG)

---

## 1. 시스템 아키텍처 요약

```
┌──────────────────────────────────────────────────────────┐
│                    사용자 (공무원/법률 실무자)               │
└──────────────────────────┬───────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
  │ 법령 검색    │  │ AI 자연어     │  │ 영향 추적기   │
  │ (키워드/조문) │  │ 검색 (FC-RAG)│  │ (Impact)     │
  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
         │                │                  │
         ▼                ▼                  ▼
  ┌──────────────────────────────────────────────────┐
  │              Next.js 16 API Routes (41개)         │
  │  law-search, eflaw, fc-rag, summarize,           │
  │  precedent-*, interpretation-*, ordin-*,         │
  │  three-tier, oldnew, impact-tracker 등            │
  └──────────────────────────┬───────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
  ┌─────────────┐  ┌───────────────┐  ┌────────────────┐
  │ 법제처 API   │  │ OpenClaw      │  │ Gemini         │
  │ (law.go.kr)  │  │ Bridge        │  │ 3-Flash /      │
  │ LAW_OC 키    │  │ (Claude 기반)  │  │ 2.5-Flash     │
  │ XML/JSON     │  │ 1순위 AI      │  │ 2순위 AI (폴백) │
  └─────────────┘  └───────────────┘  └────────────────┘
```

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| **프레임워크** | Next.js 16 (App Router) |
| **UI** | React 19, TypeScript 5, Tailwind v4, shadcn/ui |
| **AI (1순위)** | OpenClaw Bridge (Claude 기반, SSE) |
| **AI (2순위/폴백)** | Gemini 3-Flash-Preview / 2.5-Flash (Function Calling) |
| **AI (요약)** | Gemini 2.5-Flash-Lite |
| **법령 도구** | korean-law-mcp (Function Calling 기반) |
| **법령 데이터** | 법제처 Open API (law.go.kr/DRF/) |
| **클라이언트 캐시** | IndexedDB (판례), localStorage (API 응답, 즐겨찾기) |
| **서버 캐시** | Next.js HTTP Cache (s-maxage, stale-while-revalidate) |
| **문서 파싱** | hwp.js (HWP), cheerio (HTML), xmldom (XML) |
| **상태 관리** | React state + History API + IndexedDB |

---

## 3. 7대 핵심 기능

### 3.1 AI 자연어 검색 (FC-RAG)
- **엔진**: FC-RAG (Function Calling RAG) — korean-law-mcp 도구 기반
- **2-Tier 라우팅**: OpenClaw Bridge (Claude) → Gemini (폴백)
- **8가지 질의유형** 자동 분류: 정의, 요건, 절차, 비교, 적용, 결과, 범위, 면제
- **13개 법률 도메인** 자동 감지: 세금, 관세, 노동, 개인정보, 건설 등
- **4-Tier 도구 선택**: 항상(10) → 도메인별(15) → 컨텍스트(12) → 온디맨드(19)
- **인용 사후 검증**: law.go.kr eflaw API로 조문 실존 확인
- **파일**: `app/api/fc-rag/`, `lib/fc-rag/`, `components/law-viewer-ai-answer.tsx`

### 3.2 AI 법률 분석 요약
- 신구법 비교 요약, 판례 요지 추출
- 2-tier 라우팅 (OpenClaw → Gemini 폴백)
- 모델: gemini-2.5-flash-lite
- **파일**: `app/api/summarize/`, `components/ai-summary-dialog.tsx`

### 3.3 신구법 대비표
- 개정 전후 법령 2단 diff 시각화
- 동기 스크롤, diff 하이라이팅 (추가/삭제/수정)
- 연혁 드롭다운으로 특정 개정일자 선택
- 폰트 크기 조절
- **파일**: `components/comparison-modal.tsx`, `app/api/oldnew/`, `app/api/old-law/`

### 3.4 3단 비교 (위임법령 체계)
- 법률 → 시행령 → 시행규칙 위임관계 단일 뷰
- 1/2/3단 전환 가능
- 행정규칙 탭 포함
- 리사이즈 가능 패널 (react-resizable-panels)
- **파일**: `components/law-viewer-delegation-panel/`, `app/api/three-tier/`

### 3.5 위임법령 자동 추적
- 특정 조문 → 하위법령(시행령, 규칙, 고시) 네트워크 자동 스캐닝
- 조문별 위임 법령 필터링
- **파일**: `hooks/use-law-viewer-three-tier.ts`, `hooks/use-law-viewer-admin-rules.ts`

### 3.6 법령 영향 추적기
- 상위법 개정 → 하위법령 영향 자동 탐지
- 6단계 분석: 법령검색 → 참조추출 → 신구법비교 → 하위법령추적 → AI분류 → AI요약
- 심각도 3단계: critical (긴급) / review (검토) / info (참고)
- 신구법 비교 모달 연동
- **파일**: `components/impact-tracker/`, `app/api/impact-tracker/`, `hooks/use-impact-tracker.ts`

### 3.7 통합 판례/해석례 검색
- **판례**: 대법원, 고등법원 등 전체 법원 판결
- **법령해석례**: 법제처 공식 해석
- **조세심판 재결례**: 조세심판원
- **관세 해석**: 관세청
- **헌법재판**: 헌법재판소 결정
- 법원별/연도별 필터, 페이지네이션
- 판례 상세: 판시사항, 판결요지, 전문, 관련 심급
- **파일**: `components/search-result-view/PrecedentResultList.tsx`, `components/precedent-section.tsx`

---

## 4. 부가 기능

### 4.1 법령 뷰어
- 단문/전체 조문 보기, 사이드바 조문 목록 (가상화)
- AI 관련 법령 사이드바, 즐겨찾기 별표
- 모바일 하단 시트, 스와이프 네비게이션
- **파일**: `components/law-viewer.tsx`, `components/law-viewer/`

### 4.2 참조 법령 모달
- 법령 내 참조 링크 클릭 → 모달로 해당 조문 표시
- 히스토리 스택 (뒤로가기 지원)
- 법제처 원문 링크
- **파일**: `components/reference-modal.tsx`

### 4.3 별표/서식 뷰어
- 법령 별표(별표1, 별표2 등) 목록 및 열람
- Markdown / PDF 뷰 모드
- HWP → PDF/Markdown 자동 변환
- **파일**: `components/annex-modal.tsx`, `app/api/annex-*/`

### 4.4 즐겨찾기
- 법령+조문 단위 즐겨찾기 저장 (localStorage)
- 홈 화면 빠른 접근, 관리 다이얼로그
- **파일**: `components/favorites-panel.tsx`, `components/favorites-dialog.tsx`

### 4.5 최근 검색/판례
- 최근 검색어 5건 (localStorage)
- 최근 열람 판례 (IndexedDB, 7일 TTL)
- **파일**: `components/recent-searches.tsx`, `components/recent-precedents.tsx`

### 4.6 명령 검색 (Ctrl+K)
- 통합 검색 모달: 법령, 조문, 즐겨찾기, 최근 검색
- 자동완성 제안
- **파일**: `components/command-search-modal.tsx`

### 4.7 연혁 타임라인
- 법령 개정 이력 시각화 (제정/전부개정/일부개정/타법개정/폐지)
- 색상 코딩 배지, 개정 사유 표시
- **파일**: `components/revision-history.tsx`

---

## 5. API 라우트 전체 목록 (41개)

### 법령 검색/조회
| 라우트 | 용도 |
|--------|------|
| `/api/law-search` | 법령 키워드 검색 |
| `/api/eflaw` | 현행 법령 JSON 조회 |
| `/api/law-html` | 법령 HTML 조회 |
| `/api/law-article` | 특정 조문 조회 |
| `/api/law-history` | 법령 연혁 |
| `/api/law-annexes` | 별표 목록 |
| `/api/law-links` | 법령 내 링크 추출 |
| `/api/law-stats` | 법령 통계 |
| `/api/search-suggest` | 자동완성 제안 |
| `/api/search-all` | 통합 검색 |

### 비교/이력
| 라우트 | 용도 |
|--------|------|
| `/api/oldnew` | 신구법 비교 |
| `/api/old-law` | 구법 조회 |
| `/api/three-tier` | 3단 비교 (법률→시행령→시행규칙) |
| `/api/article-history` | 조문 개정 이력 |
| `/api/revision-history` | 연혁 타임라인 |
| `/api/hierarchy` | 법령 계층 |
| `/api/related` | 관련 법령 |

### 행정규칙/조례
| 라우트 | 용도 |
|--------|------|
| `/api/admrul-search` | 행정규칙 검색 |
| `/api/admrul` | 행정규칙 조회 |
| `/api/ordin-search` | 자치법규(조례) 검색 |
| `/api/ordin` | 자치법규 조회 |

### 판례/해석례
| 라우트 | 용도 |
|--------|------|
| `/api/precedent-search` | 판례 검색 |
| `/api/precedent-text` | 판례 원문 |
| `/api/precedent-detail` | 판례 상세 |
| `/api/ruling-search` | 판결 검색 |
| `/api/interpretation-search` | 법령해석례 검색 |
| `/api/interpretation-text` | 법령해석례 원문 |
| `/api/tax-tribunal-search` | 조세심판 재결례 검색 |
| `/api/tax-tribunal-text` | 조세심판 재결례 원문 |
| `/api/customs-search` | 관세청 해석 검색 |
| `/api/customs-text` | 관세청 해석 원문 |

### AI/분석
| 라우트 | 용도 |
|--------|------|
| `/api/fc-rag` | AI 자연어 검색 (메인 RAG) |
| `/api/summarize` | AI 요약 생성 |
| `/api/impact-tracker` | 법령 영향 분석 |

### 유틸리티
| 라우트 | 용도 |
|--------|------|
| `/api/annex-viewer` | 별표 내용 |
| `/api/annex-pdf` | 별표 PDF 변환 |
| `/api/annex-to-markdown` | 별표 Markdown 변환 |
| `/api/hwp-to-html` | HWP 파일 변환 |
| `/api/drf-html` | DRF 법령 렌더링 |
| `/api/article-title` | 조문 제목 |
| `/api/debug/traces` | 디버그 트레이스 |

---

## 6. 데이터 소스

| 소스 | 유형 | 인증 | 용도 |
|------|------|------|------|
| **법제처 Open API** | REST (XML/JSON) | `LAW_OC` 키 | 모든 법령, 판례, 해석례, 조례 |
| **OpenClaw Bridge** | SSE 스트리밍 | Token + CF Access | AI 1순위 (Claude 기반) |
| **Google Gemini** | REST 스트리밍 | `GEMINI_API_KEY` | AI 2순위 (폴백) |
| **IndexedDB** | 브라우저 DB | 클라이언트 | 판례 캐시 (7일 TTL) |
| **localStorage** | 브라우저 저장소 | 클라이언트 | 즐겨찾기, 최근검색, API 응답 캐시 |

---

## 7. 캐싱 전략

| 레이어 | 대상 | TTL |
|--------|------|-----|
| **HTTP Cache** | 법제처 API 응답 | s-maxage=3600, stale=86400 |
| **KNOWN_MST** | 법령 MST 코드 | 런타임 (최대 5000건) |
| **RAG 응답 캐시** | AI 답변 | 24시간 (LRU) |
| **도구 결과 캐시** | MCP 도구 응답 | 3~24시간 |
| **IndexedDB** | 판례 검색/상세 | 7일 |
| **localStorage** | API 응답 | 1시간 |

---

## 8. 사용량 관리

- IP별 일일 쿼터 제한 (`lib/usage-tracker.ts`)
- 사용자 API 키 입력 시 쿼터 우회 가능 (`X-User-API-Key` 헤더)
- AI 비밀번호 게이트 (`components/ai-gate-dialog.tsx`)
- 토큰 사용량 로깅 (inputTokens, outputTokens)

---

**버전**: 1.0 | **작성일**: 2026-03-15
