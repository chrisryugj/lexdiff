# LexDiff 프로덕션 리뷰 #2 — 개선 리팩토링 전후비교 상세 보고서

**작성**: 2026-06-28 (세션7, 마지막 프로덕션 리뷰) · **브랜치**: `feat/prod-review-viewing-history`
**프로덕션**: `main` = `928ddd2` (merge of `1421c7f`+`810400b`), **ver 2.4.1-beta 배포 확정**
**검증 대상**: 세션1~6 (집중 검증 = 세션4~6 신규 3커밋)

---

## 0. 검증 요약 (Executive Summary)

세션1~6에 걸친 UX/현행성 개선이 **프로덕션에 실제 반영**됐고, 핵심 기능(관련판례·토스트·Cmd+K)이 **의도대로 작동**함을 코드·유닛테스트·**실 법제처 API 끝단 실측**·**헤드리스 브라우저(CDP)**·**10클러스터 적대적 회귀검증**으로 확인했다.

| 핵심 지표 | BEFORE | AFTER | 검증방법 | 결과 |
|---|---|---|---|---|
| 테스트 | 674 | **693** | `vitest run` 재실행 | ✅ 45파일 693 pass |
| 타입체크 | — | clean | `tsc --noEmit` 재실행 | ✅ exit 0 |
| 관련판례(관세법 제38조) | **0건** | **28건** | `/api/precedent-search` 실측 | ✅ (아래 10쿼리 표) |
| 토스트 렌더러 | 미마운트(전부 안 뜸) | 마운트·활성 | diff+5 유닛테스트 | ✅ 잠복버그 해소 |
| Cmd+K '최근 조회' | 카드 부유/중첩 | 평평한 형제섹션 | 헤드리스 스샷 | ✅ (스샷 첨부) |
| 현행성 가드 | 1순위도구 무라벨 누수 | 라벨주입+백스톱 | 유닛테스트(+8) | ✅ tool-adapter/quality-evaluator |

**종합 판정**: 세션4~6 **critical(high) 회귀 0건**. 확정 결함 = **medium 3건**(actionable 1건 = Cmd+K selectedIndex OOB 크래시 경로, FAV-8 비-UUID id 한계 2건) + low 다수(대부분 핸드오프가 이미 인지한 엣지). 헤드리스 한계로 미검증된 항목은 §6에 수동 스팟체크 목록으로 명시.

---

## 1. 검증 방법론

1. **코드/유닛** — `npm run test:run`(693 pass), `npx tsc --noEmit`(clean) 직접 재실행. claim 수치 일치 확인.
2. **API 끝단 실측** — Gemini-only dev 서버(`DISABLE_HERMES`) 기동 후 `/api/precedent-search`를 use-precedents가 보내는 정확한 파라미터(`exact=1&bodySearch=1`)로 직접 호출 + law.go.kr `search=2`를 구문/AND로 분리 호출해 경로별 카운트 측정.
3. **헤드리스 브라우저(CDP)** — `ws`로 Chrome(149) 직접 구동, 검색→법령뷰어→Cmd+K 플로우 캡처.
4. **적대적 회귀검증** — 세션4~6 변경을 10개 파일-disjoint 클러스터로 분할, 클러스터별 리뷰→발견사항 **독립 적대적 재검증**(verify) 파이프라인(16에이전트, 257툴콜).
5. **한계(정직 고지)** — 헤드리스는 (a) `navigator.clipboard` 원천 차단(NotAllowedError)으로 복사 토스트 미발화, (b) 가상화 법령뷰어의 `activeJo`(LV-1 IntersectionObserver 스크롤추적)가 합성 네비에서 미초기화 → 판례 미니목록 fetch 미발화. **둘 다 프로덕션 회귀 아님**(실사용자/원 제보자는 스크롤로 트리거됨). 해당 항목은 API/유닛으로 대체 입증 + 수동 스팟체크 권고.

---

## 2. 핵심 지표 — 측정값

### 2.1 관련판례 0건→N건 (세션6, 실측 — 가장 중요)

`/api/precedent-search`를 use-precedents 호출 형태로 직접 측정. **OLD = 판례명검색(search=1, exact)** / **NEW = 본문검색(search=2, 구문→AND폴백)**. 추가로 law.go.kr 직접호출로 구문/AND 분리.

| 법령조문 | OLD(판례명) | NEW(본문) | 구문 | 토큰AND | 라우트경로 | top-5 관련성 |
|---|---|---|---|---|---|---|
| 관세법 제38조 | **0** | **28** | 28 | 184 | 구문 | ✅ 대법원·서울행정법원 세무사건 = 정확 |
| 민법 제750조 | **0** | 322 | 322 | 1012 | 구문 | ✅ 불법행위 손배 |
| 형법 제38조 | **0** | 374 | 374 | 2909 | 구문 | ⚠️ 경합범 보일러플레이트(오탐) |
| 국세기본법 제14조 | 1 | 2310 | 2310 | 7474 | 구문 | ⚠️ 실질과세 다수인용(일부정당) |
| 민법 제839조의2 | 2 | 230 | 230 | 267 | 구문 | ✅ 재산분할 |
| 형법 제250조 | — | 80 | 80 | 581 | 구문 | ✅ 살인 |
| 도로교통법 제44조 | — | 62 | 62 | 216 | 구문 | ✅ 음주운전 |
| 상법 제401조 | — | 153 | 153 | 236 | 구문 | ✅ 이사 제3자책임 |
| 형사소송법 제312조 | — | 204 | 204 | 374 | 구문 | ✅ 조서 증거능력 |
| **소방시설 설치 및 관리에 관한 법률 제12조** | **0** | **129** | **0** | 129 | **AND폴백** | ⚠️ 분법명 → 폴백, 관련성 혼재 |

**결론**: 전 쿼리 **0건 문제 해소**. 변별력 법명은 **구문검색**이 주경로(관세법 28건, 인접인용 판례만), 긴 분법/개명 법령명(소방시설법)만 구문 0 → **AND폴백 129**로 0건 회피. 의도된 2단 전략이 실측대로 작동.

### 2.2 테스트 / 타입체크
- `vitest run` → **Test Files 45 passed, Tests 693 passed** (handoff claim 674→693 일치). 세션4 favorites-store 복원 5건 + 세션6 precedent-search-route 5건 신규 포함.
- `tsc --noEmit` → exit 0, clean.

### 2.3 현행성 가드 (세션1)
- `lib/fc-rag/tool-adapter.ts`(TL-1/2 라벨주입), `quality-evaluator.ts`(LEAK-1/LP-5 백스톱 강등), `gemini-engine.ts`(LEAK-2/LP-1b), `prompts.ts`(LEAK-3/PREC-1) — 유닛테스트 `quality-evaluator.test.ts`(+5)·`tool-adapter.test.ts`(+3) 693 안에 포함, 통과. *(주: e2e 현행성 질의는 Gemini 비결정성·쿼터로 §6 수동 스팟체크 권고.)*

---

## 3. 영역별 BEFORE → AFTER

> 세션1~3은 핸드오프 문서에 상세 기록됨 + 683/688 테스트로 회귀 검증 완료. 여기서는 요지만, **세션4~6은 이번 세션 집중 검증 결과**까지 기술.

### 세션1 — 현행성 감사 + UX 마찰 P0/P1 (`866e1d0`, `83dea97`)
- **증상**: 1순위 검색도구(`get_batch_articles`/`search_ai_law`)가 현행성 라벨 미부착 → 프롬프트 가드 우회, 과거법령을 현행으로 단정. 프로그램적 백스톱 전무.
- **수정**: lexdiff 내부 surgical — tool-adapter 라벨 미러링 주입, quality-evaluator 현행성 백스톱(연혁/시행예정 마커 미반영→marginal 강등+캐시저장 차단), forceLastTurn 평가 추가, "시행일>오늘=시행예정본" 규칙, 판례 구(舊)조문 표기. + UX P0(VH-1 판례재조회/TM-1 타임머신모바일/ANNEX-1 빈별표) + P1(쿼터 한글라벨/Cmd+K 즐겨찾기/위임0건 중립).
- **측정/검증**: 유닛테스트 +8, 674 통과.
- **잔여**: korean-law-mcp `batch-articles.js` 루트픽스는 크로스레포(별도 릴리스) — lexdiff tool-adapter가 efYd 케이스 백스톱(부분중복).

### 세션2 — 잔여 P1 비디자인 9건 (`3b3421f`)
- SR-2/4(자동완성 에러행+AbortController), VH-2/PREC-1/3(판례 쿼리·심급), FC-RAG-2(프로그레스 점근), DELEG-1(빈탭 자동전환), **LV-1/2(전체보기 스크롤 activeJo 역추적 + 사이드바 측정값 점프)**. 7클러스터 독립 적대적 리뷰. 674 통과.
- LV-1 리뷰캐치: 모바일+데스크톱 뷰어 동시마운트 시 숨은 인스턴스가 전역 CustomEvent 수신 → `offsetParent===null` 가시성 가드.

### 세션3 — partial 3 완성 + 디자인 6 (`24b8a30`, `dd72702`)
- PREC-3/DELEG-1/VH-2 완전수정(캐시복원 시드/스테일탭/ordinanceSeq plumbing). 디자인: 빈상태/피드백/막다른길 클러스터(PREC-5/F1/F3/TM-2/OB-1/settings-F2). **683 통과**(674→+9).

### 세션4 — 토스트 인프라 복구 + 디자인 5 (`78e5881`) ⭐검증
- **증상(잠복버그)**: `useToast`/`toast()`/Radix primitives는 있는데 **`<Toaster/>` 렌더러가 layout 어디에도 없음** → 기존 모든 `toast()`(복사완료·delegation·검색피드백/에러)가 **화면에 전혀 안 뜨던 상태**(shadcn 보일러플레이트 누락).
- **근본원인**: 렌더러 미마운트. FAV-2 undo가 이 인프라에 의존.
- **수정**: 표준 `components/ui/toaster.tsx` 신설 + `app/layout.tsx:60` 마운트(부수효과로 기존 toast 전부 활성화 = 잠복버그 수정). FAV-2: `removeFavorite`가 삭제항목 반환 + `restoreFavorite`(id/createdAt 보존·index 클램프 복원). **user모드 undo DB 경합**을 `pendingDeletes` 맵 + `Promise.resolve` thenable로 delete→insert 직렬화. 디자인 4건: SR-3(모바일 투어 ai-toggle 제외), PREC-2(카피 정직화), F2(totalCount 배지 '전체 N건(상위 M건)'), PREC-4(헤더 '같은 사건명 판례'+캐비엇, 필터 불변).
- **측정/검증**: ✅ `app/layout.tsx`에 `Toaster` import+마운트 2개소 확인. ✅ favorites-store 복원 유닛테스트 **5건**(반환/id·createdAt보존/index복원/중복가드/범위클램프) 통과. ✅ 헤드리스로 ToastProvider 트리 마운트 확인(복사 토스트 시각캡처는 헤드리스 clipboard 차단으로 불가 — §6). ✅ **디자인 4건(SR-3/PREC-2/F2/PREC-4) 적대적 재검증 — 확정 결함 0건**(F2 배지 ternary가 0/undefined 안전, 캐시복원 회귀 아님, SR-3 하이드레이션 미스매치 없음, PREC-4 보호필터 0줄 변경 확인).
- **잔여리스크**: §4 toast-infra 클러스터 — undo 경합 메모리/DB 일시불일치(low, 비파괴·자가치유), reject 경로 cleanup 누락(low), 로그아웃 중 undo 게스트누수(low). TOAST_LIMIT=1로 빠른 다중삭제 시 직전 undo 토스트 소실(수용).

### 세션5 — P2 폴리시 47건 (`eefaf73`) ⭐검증
- **범위**: P2 59건 triage(apply 40·안전기본7·skip 5·이미수정 2·보류 5) → 파일-disjoint 16그룹 병렬구현 → 8영역 적대적 verify → fix. 26파일. 위임/비교모달·조례·법령뷰어·판례·결정문·타임머신·영향분석·통합검색·즐겨찾기·설정·조회기록 전영역.
- **검증서 잡힌 회귀 픽스(원 세션)**: FAV-8 머지실패 영구손실·F7 Select stale·ANNEX 이미지PDF info톤·F5 히스토리 bleed·SR-7 selectedIndex 크래시·VH-7 Cmd+K ESC충돌·DELEG-5 로딩 void.
- **측정/검증**: ✅ 688 통과. §4의 적대적 재검증에서 **샘플 클러스터 6개 의도일치 확인**, intent-match 대체로 정확. ⚠️ **신규 발견**: FAV-6가 추가한 `favoritesStore.subscribe`로 **Cmd+K selectedIndex OOB 크래시 경로**(medium, §4-A), FAV-8 orphan **비-UUID id DB 동기화 불가**(medium, §4-B).
- **잔여리스크**: PREC-10 dead CTA(미배선, 핸드오프 인지), DELEG-4 auto-switch+showAdminRules 모순(low edge, 핸드오프 인지), DEC-F6 results[0] 의존(low), F4 stale revision(low).

### 세션6 — 관련판례 본문검색 + Cmd+K 평평 (`6fcdfcb`) ⭐검증
- **증상**: 법령 조문 하단 '관련 판례'가 거의 항상 0건. Cmd+K '최근 조회'가 `<Card>`째 렌더돼 '최근 검색'과 겹쳐 부유.
- **근본원인**: `usePrecedents`가 `"법령명 제N조"`를 판례 **명**검색(search=1)으로 보내 `제N조` 토큰이 안 걸려 0건. Cmd+K는 카드-인-드롭다운.
- **수정**: ① **본문검색(search=2)** 전환 + **구문(따옴표)검색 1차 → 0건이면 토큰AND 폴백**. bodySearch 가드로 법원명/연도 오추출 스킵. 캐시키 `::ref` 네임스페이스(과거 0건 캐시 충돌차단). 다른 3개 호출부 무영향. ② `ViewingHistoryPanel embedded` prop — Card chrome 제거, 형제섹션과 동일 평평한 sticky 헤더(필터/전체삭제는 홈 전용, 개별 X 유지). 입력 X버튼 공간확보.
- **측정/검증**: ✅ **§2.1 10쿼리 실측 표** — 0→N 전면 해소. ✅ precedent-search-route 유닛테스트 **5건** 통과. ✅ **헤드리스 스샷**(§7): Cmd+K에서 '최근 조회'가 '최근 검색'과 평평하게 나란히(배지·개별X 유지, 부유/중첩 없음).
- **잔여리스크**: 고빈도 보일러플레이트 조문(형법 제38조 경합범 374) 구문검색 오탐 잔존 → **§5 ROI 판단**. bodySearch 가드 유닛 미커버(low). 판례 미니목록 UI 시각캡처는 헤드리스 activeJo 한계로 미확보(§6 수동).

---

## 4. 적대적 회귀검증 결과 (세션4~6, 10클러스터)

**판정**: high(critical) 회귀 **0건**. 클러스터별 intent-match 양호. 확정 결함 medium 3 + low 다수.

| 클러스터 | 판정 | 확정 결함 |
|---|---|---|
| toast-infra | 의도일치 | low×3 (undo 경합/cleanup/로그아웃누수) |
| s4-design5 | **정확일치** | 없음(후보 4건 자가반증 무효 — F2 배지 ternary 0/undefined 안전·캐시복원 회귀아님·SR-3 하이드레이션 OK) |
| s6-precedent-search | **정확일치** | low×2 (가드 테스트미커버·고빈도 오탐) |
| s6-cmdk-embedded | **정확일치** | 없음(pr-12는 선행커밋, 오탐 기각) |
| s5-delegation-modals | 대체로일치 | low×2 (F4 stale rev·DELEG-4 가드edge) |
| s5-ordinance | 높음 | low×1 (OB-4 정합은 org축만, metros축 갭) |
| s5-lawviewer-annex | 정확일치 | 없음 |
| s5-precedent-decision-tm | 대체로일치 | low×2 (PREC-10 dead CTA·DEC-F6 results[0]) |
| s5-fcrag-impact-search | 대체로일치 | **medium×1**(A) + low×1(ARIA) |
| s5-fav-settings-vh | 대부분일치 | **medium×2**(B) + low×2 |

### 🔴 A. [medium/regression] Cmd+K selectedIndex OOB 크래시 — `command-search-modal.tsx`
- **확정(confidence high)**. FAV-6가 추가한 `favoritesStore.subscribe(setFavorites)`(L116)로 모달 열린 채 favorites가 반응형 축소 가능. 그러나 Enter 분기(L190-193)의 `favIndex = selectedIndex - suggestions.length - displayedRecentSearches.length` 에 **바운드 검사 없음** → favorites 축소 시 selectedIndex stale → `handleFavoriteClick(displayedFavorites[favIndex])`에 undefined 전달 → `fav.lawTitle` 읽다 **TypeError**.
- 커밋 전(eefaf73^)엔 favorites가 load-once라 **이 경로 자체가 없었음 = 신규 도입**. SR-7 픽스는 최근검색 삭제 경로(`setSelectedIndex(-1)`)만 막고 **동일 클래스인 favorites 축소는 무방비**.
- **권고**: favorites/recentSearches 변경 effect에 `setSelectedIndex(-1)` 추가, 또는 favIndex 바운드 가드(`displayedFavorites[favIndex]` falsy면 무시). **surgical 1~2줄.** (§6 P0)

### 🟠 B. [medium] FAV-8 orphan 비-UUID id — `favorites-store.ts`
- **확정(high, 코드+스키마)**. `005_favorites.sql:8 id uuid primary key`인데 게스트 addFavorite는 `${Date.now()}-${Math.random()}` 비-UUID id 부여(L189-192). 머지 upsert가 `id: f.id`를 실어보내(L41) Postgres가 충돌처리 전 uuid 파싱 → **'invalid input syntax for type uuid'로 배치 전체 실패**. 따라서 `mergeFailed`는 일시오류가 아니라 **게스트 즐찾이 있을 때의 상시 결과** → orphan은 화면/localStorage에 무한보존되나 **DB엔 영원히 미기록**(주석 '재머지'는 영영 성공 안 함). **새 기기 로그인 시 그 즐찾 소실.**
- **자매결함 B2 [medium/missing-edge]**: 그 orphan을 로그인 상태에서 삭제하면 `.delete().eq('id', 비-UUID)` → 동일 uuid 캐스트 에러 → 롤백 splice 재삽입 → **삭제 불가**(별 토글도 동일).
- **성격**: 비-UUID id 스킴은 **선재(pre-existing)** — FAV-8(데이터손실 방지=화면유지)이 이를 **표면화**한 것. FAV-8의 명시 의도(클리어로 인한 손실 방지)는 달성됐으나, 근본 머지는 불가. **권고**: 게스트 즐찾에 `crypto.randomUUID()` 부여(또는 머지 시 id 제거하고 DB default 사용) → 머지·삭제 양쪽 해결. (§6 P1)

### 🟡 low (요지) — 대부분 핸드오프가 이미 인지
- toast undo 경합(비파괴·자가치유), reject cleanup 누락, 로그아웃중 undo 게스트누수 / s6 bodySearch 가드 유닛 미커버 / OB-4 metros축 정합갭 / F4 stale revision / DELEG-4 auto-switch+showAdminRules 모순(핸드오프 인지) / PREC-10 dead CTA(핸드오프 인지) / DEC-F6 results[0] 의존(핸드오프 인지) / VH 게스트이력 머지도 동일 비-UUID 문제(orphan 보존없어 로그인시 패널서 소실) / SR-5 ARIA combobox 미완(aria-controls/listbox 없음).

---

## 5. 본문검색 잔존 오탐 정밀화 — ROI 판단

**데이터**: 변별력 법명(관세법 제38조)은 구문검색 28건·top-5 정확. 고빈도 보일러플레이트 조문(형법 제38조 경합범)은 구문 374건이나 top-5가 양형 인용 형사판결로 채워져 토픽 관련성 낮음. 노출은 `display=5`+`ddes`(최신순)로 한정. **law.go.kr은 관련도 정렬 API 없음.**

| 정밀화안 | 효과 | 비용/리스크 | ROI |
|---|---|---|---|
| ① 사건종류명 도메인 필터 | 형사판결 등 배제 | 도메인 큐레이션 필요·교차도메인 정판례 누락(false negative) | **낮음** |
| ② 형사 경합범 컷 | 형법38 한정 개선 | 1조문 하드코딩·취약 | **낮음** |
| ③ 대법원/심급 우선 후처리 | 권위순 정렬 | court 필드 이미 보유→클라 stable sort 저비용. 단 최신순 희생·체감개선 한계 | **한계적** |

**권고: ①② 미적용**(유지비·취약·false negative). **③도 현시점 보류** — 0건→N건이라는 **차단성 버그 해소가 본질 가치**고, 잔존 오탐은 5건 리스트의 관련도 nuance(고빈도 조문 한정). 사용자 판례 관련도 불만이 실제 제기되면 ③(court-priority client sort, ~5줄)을 우선 검토. **현 잔존오탐은 알려진 한계로 문서화하고 보류가 합리적.**

---

## 6. 잔여 리스크 & 권고 (우선순위)

**코드 수정 권고**
- **P0** — §4-A Cmd+K selectedIndex OOB 크래시: favorites 축소 effect에 `setSelectedIndex(-1)` 또는 favIndex 바운드 가드. surgical 1~2줄. *(커밋은 사용자 확인 후 — main 직푸시 금지)*
- **P1** — §4-B 게스트 즐찾/이력 비-UUID id: `crypto.randomUUID()` 부여 또는 머지 payload에서 id 제외. FAV-8/VH 머지·삭제 동시 해결.
- **P3(보류)** — §5 본문검색 오탐 정밀화(③ court-priority), §4 low들(핸드오프 인지 항목).

**수동 스팟체크 권고 (코드/헤드리스 불가 항목)**
1. **관련판례 미니목록 UI** — 실 브라우저서 법령뷰어 조문 열고 스크롤(activeJo 세팅)→'관련 판례' 토글: 관세법 제38조·민법 제750조 N건 뜨는지, 소방시설법 제12조 폴백 뜨는지. *(API로는 0→N 입증완료, UI 시각만 미확인 — 헤드리스 activeJo 한계)*
2. **토스트 시각** — 복사완료/FAV-2 undo 토스트 위치·테마·TOAST_LIMIT=1 동작(헤드리스 clipboard 차단으로 미캡처).
3. **모바일 Cmd+K** — 360~390px 폭서 '최근 조회' 평평·X버튼 비겹침(데스크톱은 스샷 확인됨).
4. **현행성 e2e** — Gemini 경로로 소방시설법 분법·efYd 과거 질의 시 연혁을 현행으로 단정 안 하는지(유닛은 통과, e2e는 비결정성).
5. **잔여 P0 항목** — VH-1 판례재조회·TM-1 타임머신모바일·ANNEX-1 빈별표·별지서식.

---

## 7. 첨부 — 헤드리스 스샷 (AFTER)

> BEFORE는 구버전 미배포라 캡처 불가 — 텍스트로 대비 기술. 파일: `scratchpad/`(세션 로컬).
- **`03-cmdk.png`** — Cmd+K 모달: '최근 검색'(관세법 38조)과 **'최근 조회'(배지1·관세법 제38조·개별X)가 평평한 형제섹션으로 나란히**. BEFORE=Card 테두리·그림자로 부유/중첩. (세션6 embedded ✅)
- **`05-toast-copy.png`** — 법령뷰어 관세법 제38조: 액션바(신구비교/AI요약/원문/위임법령/**판례**/분석/즐겨찾기) + 개정이력 28건. 검색→뷰어 플로우 정상.
- **`02-search-results.png`** — 검색 결과 진입.

---

### 부록 — 검증 환경
Gemini-only(`DISABLE_HERMES`) dev `:3939` · LAW_OC 실키 · Chrome 149 헤드리스 CDP(`ws`) · 적대적 회귀검증 워크플로우 16에이전트(1.14M토큰). 커밋·푸시 없음(사용자 확인 후 main).
