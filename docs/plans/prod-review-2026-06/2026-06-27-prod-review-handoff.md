# LexDiff 프로덕션 리뷰 핸드오프 (2026-06-27)

브랜치: `feat/prod-review-viewing-history` (커밋 `886683f`, `8b2f5e3`, `c6f14f6`, `fa774ed`)

---

## 🟢 세션 2 완료 (2026-06-27 오후, 타입체크+662 테스트 통과)

| 항목 | 상태 | 비고 |
|---|---|---|
| 마이그레이션 011 | ✅ **적용됨** | Supabase Management API(PAT)로 적용. viewing_history 테이블+RLS 4개 확인. PAT는 `.env.local` `SUPABASE_ACCESS_TOKEN`. ⚠️CF 1010 → 브라우저 UA 필수 |
| P1b 캐시 6자리 | ✅ 완료 | `getAnnexCacheKey` 6자리 정규화 (`c6f14f6`). 별지 충돌 회피 |
| P1a 별지 풀구현 | ✅ 완료 | 매처+모달+aria end-to-end (`fa774ed`). **실측**: 법제처 "별지 제N호서식"=별표종류 "서식"(knd=2), 별표번호 6자리 → 번호매칭 일치. 별표 경로는 isForm 게이트로 불변. AI답변 Markdown 별지도 함께 정상화 |
| 별지 테스트 | ✅ +5건 | `unified-link-generator.test.ts` (총 662 pass) |
| 프리뷰 배포 | ✅ 푸시됨 | `feat/prod-review-viewing-history` push → Vercel Preview. **프로덕션은 아직 16일전 구버전(4.4.0)** — 프리뷰서 검증 후 main 머지(PR) 필요 |

**남은 브라우저 검증 (프리뷰서)**: 핸드오프 기존 4건 + **별지**: 법령뷰어 본문/AI답변의 "별지 제N호서식" 클릭 → 모달이 서식 본문(PDF/HWP) 뜨는지. (모달 fetch/렌더는 실서버 API 의존이라 로컬 단위테스트 불가 — 프리뷰 클릭 검증 필수)

---

## ✅ 이번 세션 완료 (타입체크 + 657 테스트 통과)

| 영역 | 내용 | 파일 |
|---|---|---|
| 의존성 | korean-law-mcp 4.4.2 / kordoc 3.5.1 | package.json |
| 판례 ① | search_decisions 92% 에러 = 옛 mcp(3.2.x). 4.4.2 실측 정상 | (의존성) |
| 판례 ② | precedent-search query 정제 법령명 손상 → `exact=1` 분리 | precedent-search/route.ts:18, use-precedents.ts:88 |
| 별표 | fast-path 가지번호(별표 3의2) 지원 | fast-path.ts:129 |
| 성능 | 단계별 latency 전부 null → 계측 복구(SSE 타임스탬프) | fc-rag/route.ts:171,401,408,486 |
| 조회기록 | 신규기능 전체 (아래 ⚠️ 마이그레이션 적용 필요) | viewing-history-store.ts 등 |

---

## 📌 배포 전 필수 (반드시 먼저)

1. **마이그레이션 011 적용** — 조회기록 DB 테이블. 미적용 시 로그인 유저 동기화 실패(게스트 localStorage는 무관).
   ```bash
   # supabase CLI 미설치. 둘 중 하나:
   # (a) supabase db push   (CLI 설치 시)
   # (b) Supabase 대시보드 → SQL Editor에 supabase/migrations/011_viewing_history.sql 붙여넣기 실행
   ```
2. **Vercel 재배포** — 4.4.2가 프로덕션에 반영돼야 판례/별표 적용. lockfile 기준 빌드되므로 push만으로 됨.
3. **브라우저 테스트**:
   - 판례 제안: "근로기준법 제15조" 등 법령뷰어 진입 → 하단 관련판례 뜨는지 (precedent-search exact=1 효과)
   - "공공기관의 정보공개에 관한 법률" 판례 — 법령명 손상 없이 검색되는지
   - 별표: "관세법 별표 3의2" fast-path 동작
   - 조회기록: 법령/조례/판례 본 뒤 홈 하단·Cmd+K에 "최근 조회" 뜨고 클릭 시 재조회되는지
4. **효과 검증(텔레메트리)** — 배포 1주 후 재측정:
   - `node scratchpad/telemetry-report.cjs` 류로 search_decisions 에러율↓, 단계별 latency가 null이 아닌지 확인
   - (이번 세션 스크립트: service_role 키로 ai_telemetry 집계. .env.local에서 SUPABASE_SERVICE_ROLE_KEY 로드)

---

## ⬜ 남은 작업 (우선순위)

### P1 — 별지/별표 뷰어 (사용자 "별표 별지 서식 파싱" 잔여)
- **별지 뷰어 링크 부재**: `link-pattern-matchers.ts` collectAnnexMatches에 별표만 있고 별지(別紙 제N호서식) 패턴 없음. `link-specialized.ts:291-325`(Markdown)엔 구현돼 있음 → HTML 뷰어용 패턴 이식.
  - ⚠️ 링크 생성 + `content-click-handlers/annex-handler.ts` 별지 처리 + 브라우저 검증 묶음. 회귀 민감.
- **annex-cache 6자리 코드 미정규화**: `lib/annex-cache.ts:44` getAnnexCacheKey가 "000203" 형식을 정규화 안 해 "2의3"과 캐시 키 불일치 → 캐시 미스. `annex-modal.tsx:42` extractAnnexNum 로직 인라인.

### P2 — 성능 (latency 계측 데이터 확보 후 판단)
- fast-path 길이제한 100→150 완화 (`fast-path.ts:73`) — 거짓양성 위험, 데이터 보고 결정
- get_batch_articles 31% 에러(MST 불일치): `tool-adapter.ts:185` MST_MISMATCH 재분류 있으나, 일시적 에러(timeout/5xx) 재시도 없음 → `executeTool`에 transient 재시도 추가 검토
- citation verify 15s 고정 오버헤드 (`route.ts` streamCitationVerification) — citation 적으면 타임아웃 축소

### P3 — UI/UX (디자인 결정 포함, 메모리 feedback-design-vitality 준수)
- 로딩 초기단계(0-10%) 세분화 `ai-answer-loading.tsx`
- 텍스트 대비 `text-gray-400→500` (WCAG, 접근성)
- 에러/빈결과 피드백 (단 search_decisions 에러는 4.4.2로 감소했을 것)

### 보류 (over-engineering 판단)
- Gemini while loop 누적 타임아웃: maxToolTurns 5 × per-turn 타임아웃이 이미 상한. 텔레메트리 max 124s ≪ 305s라 미발생.
- prodreview의 Hermes/Claude 경로 P0들: **Hermes 비활성이라 죽은 경로**.

---

## ⚠️ 함정 (다음 세션 필독)

1. **Hermes 비활성, Gemini ONLY** — `route.ts:296 DISABLE_HERMES`(2026-04-13~). 프로덕션 fc-rag 100% gemini-3-flash-preview. 디버깅은 `gemini-engine.ts` 위주. (CLAUDE.md·메모리의 "Primary=Hermes"는 옛 정보 — architecture 메모리 정정함)
2. **판례 2경로**: AI답변 판례 = fc-rag(`search_decisions`, mcp). 법령뷰어 관련판례 = `/api/precedent-search`(법제처 직접, ai_telemetry에 안 잡힘). 별개로 디버깅.
3. **링크 2경로**: AI답변 = `linkifyMarkdownLegalRefs`(link-specialized.ts, Markdown). 뷰어 = `link-pattern-matchers.ts`(HTML). 혼동 금지.
4. **조회기록 재조회**는 `toReviewQuery`로 통합검색 재실행(정확 상태복원 아님). 판례/조례는 결과화면에서 한 번 더 클릭 필요할 수 있음 — 정밀 상태복원은 후속.

---

## 다음 세션 시작 프롬프트 (복붙용)

```
lexdiff(~/workspace/lexdiff, 브랜치 feat/prod-review-viewing-history) 프로덕션 리뷰 이어가자.
먼저 .claude/plans/2026-06-27-prod-review-handoff.md 읽어. 배포 검증(마이그레이션 011 + Vercel + 브라우저 테스트)부터 확인하고,
남은 작업 P1(별지 뷰어 링크 + annex-cache 6자리)부터 진행해.
주의: Hermes 비활성·Gemini only, 판례/링크 2경로 함정 문서 참고. 수정 후 타입체크+657테스트 검증.
배포 1주 됐으면 ai_telemetry 재측정으로 search_decisions 에러율·단계별 latency 효과 확인.
```
