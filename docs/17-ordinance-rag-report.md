# 조례 통합 RAG 및 UI/토큰 최적화 심층 보고서

## 1. 현황 요약
- LexDiff는 Google File Search RAG 기반 자연어 검색, 신·구법 대조, 3단 비교, 행정규칙 조회 등 고급 기능을 이미 보유하고 있습니다. 법령·조례 검색과 IndexedDB 캐시, Gemini 2.5 Flash 요약 기능까지 유기적으로 구성되어 있습니다.【F:README.md†L7-L155】
- 홈 화면은 히어로 섹션 + Stats + Feature + CTA로 구성된 SearchViewImproved, 검색 결과 화면은 SearchResultView에서 헤더·검색·RAG·법령 뷰어·모달을 조합한 복합 뷰입니다.【F:components/search-view-improved.tsx†L1-L145】【F:components/search-result-view.tsx†L1-L120】

## 2. 조례 포함 RAG 아키텍처 옵션
| 옵션 | 설명 | 장점 | 단점 | 추천 시나리오 |
| --- | --- | --- | --- | --- |
| 단일 멀티-세그먼트 벡터 스토어 | 법률·시행령·시행규칙·조례를 하나의 컬렉션에 저장하되 `lawType`, `jurisdiction`, `hierarchyDepth` 메타데이터로 필터링 | 검색 파이프라인 단순화, 재사용 쉬움, 상호 참조 질문(법률 vs 조례) 대응 | 토큰 소진 리스크, 고빈도 법령이 장비하여 지방 규칙이 희석될 수 있음 | 다단 비교/AI 검색이 자주 법령+조례를 동시에 요구할 때 |
| 이중 스토어 (법령/조례 분리) | 기존 국가법령 스토어 유지, 별도 조례 스토어 구축, 질의 의도에 따라 라우팅 | token 및 context 크기 정교 제어, 인덱싱/동기화 스케줄 분리 가능 | 라우팅 오탐 시 재시도 필요, 운영 복잡도 증가 | 지역 전용 워크로드가 많고, free plan 토큰을 우선 조례에 배분해야 할 때 |
| 하이브리드 (Shared Retriever + Per-Segment Ranker) | 공통 retriever는 상위 20개 후보를 반환하고, post-ranker가 국가법령/조례를 각각 top-k 재선별 | 질문 의도가 불분명해도 recall 확보, ranking 단계에서 토큰 사용 제어 | 구현 난이도, 지연 증가 | 초기 실험 단계: recall 보장 + 토큰 상한 유지 |

**권장:** 조례 데이터 초기 확장기에는 "하이브리드"를 권장합니다. 기존 Google File Search 인프라를 활용해 통합 recall을 얻고, 후속 Ranker에서 `k_law=4`, `k_ordinance=2` 수준으로 상위 문서를 재편성하면 총 `top_k<=6` 유지가 가능해 무료 플랜 토큰 한도를 지킬 수 있습니다.【F:docs/ordinance-rag-report.md†L8-L21】

### 2.1 데이터 파이프라인
1. **수집:** 법제처 조례/규칙 API + 기존 국가법령 API. 각 문서에 `lawType`, `organization`, `effectiveDate`, `scope` 메타 삽입.
2. **정규화:** `lib/law-parser.ts`에서 이미 사용 중인 JO 코드 빌더(`buildJO`, `formatJO`)를 재사용하여 조례 조문 ID를 6자리 체계로 통일함.【F:README.md†L156-L190】
3. **임베딩:** 조문/항/호 단위 chunk (512~768자)로 분할. chunk마다 `source`, `articleDisplay`, `jurisdiction` 필드 포함.
4. **저장:** Planetscale/Turso 등 지원하는 경우 `namespace = jurisdiction` 를 기본 파티션으로 삼아 동시 업데이트시 잠금 최소화.
5. **동기화:** 기존 `check-law-sizes.mjs` 등 스크립트에 조례 대상 추가 후 GitHub Actions에서 주기 실행.

### 2.2 RAG 질의 라우팅
- `detectQueryType`는 이미 검색 결과 컴포넌트에서 사용되므로, 동일한 로직을 `/api/file-search-rag` 프록시 전 단계에서 호출하여 질의가 "조례" 키워드를 포함하는지(`조례`, `규칙`, 시군구명 패턴) 판단할 수 있습니다.【F:components/search-result-view.tsx†L1-L64】
- 라우팅 로직 예시:
  1. `detectQueryType` → `"ordinance" | "national" | "mixed"` 반환.
  2. `mixed`일 경우 하이브리드 모드: shared retriever로 20개 후보 확보 후 조례/법령별 재정렬.
  3. `ordinance`일 경우 조례 스토어만 조회하고, 추가적으로 행정규칙(고시 등) 연결을 위해 기존 행정규칙 캐시를 재사용.

### 2.3 top-k 권장치
- **법률:** 조문 길이가 길고 hierarchical dependency가 크므로 `k=4`가 평균적으로 1,600~2,400 토큰 context를 형성합니다 (chunk당 400~600 토큰 가정).
- **조례:** 문장 수가 적지만 지역별 편차가 큰 만큼 `k=2`로 유지, 필요 시 후순위 chunk를 reference modal에서 lazy-load.
- **확장:** 로컬 피드백으로 recall이 부족하면 `dynamic k` (query length > 80자 또는 "정의" 등 키워드 포함 시 `k=5+2`)을 사용하되, 응답 생성 시 context trimming을 통해 `<=3,500 tokens`를 유지하면 Gemini 2.5 Flash 무료 플랜 (대략 8K context) 내에서 안전합니다.

### 2.4 연구 프롬프트 유지 + 최소 토큰 전략
- **원칙:** 현재 프롬프트에서 법령 설명 구조, citation placeholder 등 주요 문장을 유지하되, 파라미터화로 불필요한 중복 제거.
- **테크닉:**
  1. **스켈레톤 텍스트 캐싱:** "질문:" "문맥:" "답변지침:" 같은 고정 프롬프트를 서버에 상수로 선언하여 런타임 concat 대신 템플릿 literal을 사용해 메모리 할당을 최소화.
  2. **메타데이터 JSON 축소:** chunk payload에서 `articleNumber`, `lawTitle`, `sourceUrl`만 남기고, 이미 UI가 표시하는 `lawType` 등은 응답 생성 후 매칭.
  3. **압축된 citation 포맷:** `[{lawId}:{articleJo}:{score}]` 처럼 40바이트 내외 식별자를 사용하면 출력 토큰을 평균 8~10% 줄일 수 있음.
  4. **Response shaping:** Gemini의 `response_schema` (JSON) 기능을 사용해 bullet 요약 수를 고정하면 불필요한 문장을 차단.

## 3. Gemini 2.5 Flash 무료 플랜 한도 최적화
- 무료 플랜은 월 15 RPM / 1,500 TPM 제한(공개 스펙 기준)을 가정하고, 8K context를 안전선으로 본다.
- **쿼터 모니터링:**
  1. RAG API 라우트에 `x-token-usage-estimate` 헤더를 추가: `prompt_tokens_est = chunk_count * avg_chunk_tokens + prompt_shell_tokens`.
  2. `@/lib/debug-logger`에 `warn` 레벨 로깅을 추가하여 70% 초과 시 UI 배너에 경고 표시.
  3. 하루 단위 Redis counter(`gemini_usage:{date}`)를 두고 RPM/TPM을 sliding window로 측정.
- **UI 표시:** SearchResultView 상단 progress 패널 옆에 "Token Budget" 배지를 추가해 현재 사용량을 색상별로 표시 (<=50% 초록, <=85% 호박, >85% 빨강).

## 4. UI/워크플로우 OPUS 모델 진단
### 4.1 Observation
1. **홈 화면:** Hero → Stats → Features → CTA까지 스크롤 분량이 많아 검색 진입까지 1-fold 이상 소요.【F:components/search-view-improved.tsx†L53-L145】
2. **검색 결과 화면:** Header, SearchBar, FavoritesPanel, RagSearchPanel, RagResultCard, LawViewer, 여러 모달이 한 페이지에 공존해 시야가 분산됩니다.【F:components/search-result-view.tsx†L1-L120】
3. **Progress Dialog:** `SearchProgressDialogImproved`가 별도로 열리면서, Header의 로더/Progress 컴포넌트와 중복 표현이 발생합니다.【F:components/search-result-view.tsx†L25-L60】

### 4.2 Problem
1. **Cognitive Load:** 홈 화면의 장식 요소가 실사용자(법령 전문가)의 빠른 작업 흐름을 방해.
2. **Redundant Components:** FavoritesPanel과 FavoritesDialog가 모두 포함되어 있어 상태 관리 복잡도와 DOM 렌더링 비용이 증가.
3. **RAG Panel Fragmentation:** RagSearchPanel, RagResultCard, RagAnswerCard가 분리돼 있어 토글/상태 전달 코드가 반복됨.

### 4.3 Upgrade
1. **Hero/Stats 통합 카드:** Hero 내부에 핵심 숫자(캐시 적중률, RAG latency 등)를 Chip으로 배치하여 접는 방식 제안. Section별 padding을 줄여 첫 fold 내에 검색창+metric을 노출.
2. **Favorites 통합:** SearchViewImproved에서는 Dialog만 유지하고, SearchResultView에서는 panel을 `command-k` 단축키 또는 side sheet로 이동해 두 UI를 공유 Store로 연결.
3. **RAG Workspace:** RagSearchPanel + RagResultCard + RagAnswerCard를 하나의 `RagWorkspace` 컨테이너로 통합해 `query`, `progress`, `answer`를 Context API로 공유하면 props drilling 감소.
4. **Progress Consolidation:** SearchProgressDialogImproved를 header ribbon으로 대체, SSE 단계별 상태만 표시하고 모달은 오류 상황에만 사용.
5. **Design Tokens:** Tailwind v4 새 토큰(`--radius`, `--muted`)을 활용해 Section 간 대비를 줄이고 Accessibility 대비를 확보.

### 4.4 Systemization
- **Design Review cadence:** UI 변경 시 `docs/design-decisions.md`에 OPUS 기록 추가.
- **Storybook-lite:** 핵심 컴포넌트(검색 바, RagWorkspace, Favorites entry)를 `apps/storybook` 혹은 `pnpm test:visual`로 분리해 회귀 테스트.
- **Workflow 통폐합 후보:**
  - Hero Stats/Features/CTA → "Insight Panel" 하나로 병합.
  - FavoritesPanel + FavoritesDialog → `FavoritesSurface` 하나로 축소.
  - `search-progress-dialog` 두 버전 → 개선된 단일 컴포넌트 유지, legacy 삭제.

## 5. 무료 플랜 한도 자동 감시 기능 검토
1. **집계 계층:**
   - `/api/file-search-rag` 응답에 Gemini API response header(`x-response-id`, `x-stats-usage`)를 캐치하여 Turso/SQLite(`db/usage.db`)에 저장.
   - `check-vector-db.mjs`와 유사한 CLI를 만들어 일일 사용량 리포트를 Slack/webhook으로 전송.
2. **판단 로직:**
   - RPM: sliding window 60초 내 요청 수 계산. 초과 예상 시 "지금 요청은 12초 후 재시도" 메시지를 UI에 표기.
   - TPM: 프롬프트 토큰 추정 값 + 응답 토큰 추정 값이 잔여치보다 큰 경우, `dry-run` 모드로 전환하여 "간략 요약"만 반환.
   - File Search 비용: File Search API 호출 수를 별도 카운터로 기록하여 무료 크레딧 내인지 표시.
3. **UI 반영:** SearchResultView 상단에 `PlanStatusBadge` 컴포넌트(색상+툴팁+세부치)를 추가하여 현재 상태를 알려주고, 무료 플랜 한도 초과 시 관리자 설정 페이지 링크 제공.
4. **구현 난이도:** 낮음 (기존 Next.js API 경로에 미들웨어 형태로 삽입 가능) / 예상 2~3일.

## 6. 실행 우선순위
1. **하이브리드 RAG PoC (1주):** 조례 데이터 3개 지자체로 제한, `k_law=4`, `k_ord=2` 실험.
2. **토큰 가드 + UI 배지 (2일):** API 라우트에 추정치 기록 + SearchResultView에 시각화.
3. **OPUS 개선 #1 (Hero/Stats 통합, Favorites 정리) (3일):** 홈/검색 뷰 공통 레이아웃 개편.
4. **Plan-limit watcher (병행 2일):** Slack 알림 + 관리자 경고.
5. **Full ordinance rollout (추가 2주):** 데이터 확대 + 사용자 테스트.
