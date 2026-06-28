# LexDiff 프로덕션 리뷰 #2 — UX 워크플로우 + 현행성 감사 결과 (2026-06-27)

브랜치: `feat/prod-review-viewing-history`. 직전: `2026-06-27-prod-review-handoff.md`.
검증 상태: **타입체크 clean + 688 테스트 통과**. 프로덕션은 아직 구버전 — 신규는 프리뷰에만.

방식: 14개 기능 UX 워크플로우 발굴(98 마찰) + 현행성 누수 4영역 추적(19 경로). Verify 단계가 세션리밋에 걸려 메인루프가 직접 검증·수정.

---

## ✅ 세션6 완료 (2026-06-28, commit `1421c7f` main 머지 + 프로덕션 배포, ver 2.4.1-beta)
2건 모두 수정·검증. 타입체크 clean + **693 테스트**(688→+5). 실 법제처 API 끝단 검증.
1. **관련 판례 0건 해소** — `usePrecedents` "법령명 제N조" 판례명검색(0건) → **본문검색(law.go.kr `search=2`)**. 정밀도: **구문(따옴표)검색 1차 → 0건이면 토큰 AND 폴백**(route.ts). 변별력 법명은 인접매칭 오탐차단(관세법 제38조 184→28, 형법 경합범 오염 배제), 긴 분법/개명 법령명은 폴백으로 0건 회피(소방시설법 제12조 129). 캐시키 `::ref`로 과거 0건 캐시 차단, bodySearch 경로 법원명/연도 오추출 스킵. 다른 3개 호출부 무영향. 재현테스트 5건.
   - ⚠️ **잔존 오탐(후속)**: search=2는 토큰 AND라 구문폴백 시점엔 형법 총칙 빈출조문(제38조 경합범 등)·흔한 법명 오탐 잔존. 미적용 정밀화 = ①사건종류명 도메인 필터 ②형사 경합범 컷 ③대법원/심급 우선 후처리(sort는 ddes 최신순 유지, 관련도 정렬 API 없음).
2. **Cmd+K '최근 조회' 레이아웃** — `ViewingHistoryPanel` `embedded` prop: Card chrome 제거, 형제 섹션과 동일 평평한 sticky 헤더(필터/전체삭제는 홈 패널로, 개별 X 유지). 입력 X버튼은 `pr-12`로 공간확보(겹침 없음).
- 문서 현행화: CHANGELOG `[2.4.1-beta]`(세션4~6), README 배지·package.json 2.4.1-beta 동기화.

---

## 🏁 세션7 — **마지막 프로덕션 리뷰** (다음 세션 프롬프트)
어제~오늘(세션4~6) 개선이 프로덕션에서 실제로 작동/개선됐는지 끝단 검증 + 회귀 점검 후, **개선 리팩토링 전후비교 상세 보고서**를 최종 산출물로 남긴다.

```
lexdiff(브랜치 feat/prod-review-viewing-history) — 마지막 프로덕션 리뷰. ultracode.
main=1421c7f 프로덕션 배포됨(2.4.1-beta). .claude/plans/2026-06-27-ux-review-handoff.md '세션4/5/6' 섹션 먼저 읽어.

검증 대상 = 어제~오늘 3세션:
- 세션4(78e5881): 토스트 인프라 복구(Toaster 마운트, 잠복버그) + 디자인 5건(FAV-2 삭제 undo / SR-3 온보딩 / PREC-2 카피 / F2 총건수 배지 / PREC-4 '같은 사건명 판례')
- 세션5(eefaf73): P2 폴리시 47건(위임·조례·뷰어·판례·FC-RAG·즐겨찾기·조회기록 등 전영역)
- 세션6(1421c7f): 관련판례 본문검색(구문→AND폴백, 0건 해소) + Cmd+K 조회이력 평평한 섹션

과제:
1) 브라우저/프리뷰 검증(코드테스트 불가) — 헤드리스 스샷으로 증빙:
   - 관련판례: 법령뷰어 조문→'관련 판례' 실제로 뜨는지(관세법 제38조·민법 제750조 등 0건 아님), 분법 법령(소방시설법 제12조)도 폴백으로 뜨는지. 본문검색 오탐(형법 경합범·흔한 법명) 체감 정도.
   - 토스트: FAV-2 즐겨찾기 삭제→'실행취소' 토스트 노출·복원, 복사완료/검색피드백 토스트 위치·테마·TOAST_LIMIT=1.
   - Cmd+K: 모바일서 '최근 조회' 평평(부유/중첩 없음)·입력 X버튼 안 겹침.
   - 잔여: VH-1(판례 재조회)·TM-1(타임머신 모바일)·ANNEX-1(별표)·별지·현행성(분법/efYd 과거 질의).
2) 회귀 검증(적대적): P2 47건 샘플이 의도대로 작동하고 깨진 것 없는지. 세션4~6 커밋 diff 재검토(구현 품질·빠진 엣지).
3) 본문검색 잔존 오탐 정밀화 적용 여부 판단(사건종류명 필터/심급 우선) — ROI 보고 결정.

최종 산출물 = **개선 리팩토링 전후비교 상세 보고서**(important-docs/ 또는 .claude/plans/에 .md):
- 세션1~6 전체를 영역별 BEFORE→AFTER: 증상/근본원인 → 수정 → 측정개선(수치·헤드리스 스샷 전후) → 검증방법 → 잔여리스크.
- 핵심 지표: 관련판례 0건→N건(실측 표), 토스트 잠복버그→활성, 현행성 가드, 테스트 674→693, 타입체크 clean.
- 주요 UI 전후 스샷 첨부.

함정: Hermes 비활성·Gemini only / 판례·링크 2경로 / .claude/plans gitignore(로컬만) / TOAST_LIMIT=1 / 본문검색=토큰AND+구문폴백(오탐 잔존) / 세션4~6 후속 nit은 각 섹션 참조 / 커밋·푸시는 사용자 확인 후 main.
```

---

## 🔴 세션6 (당시 예정 원본 — 위에서 완료) — 2건 (2026-06-28 사용자 제보, 프로덕션 검증 중 발견)

### 1. 관련 판례 조회 기능 사실상 깨짐 (확정, 프로덕션 API로 실측)
법령 조문 하단 '관련 판례'가 거의 항상 0건. **진짜 없는 게 아니라 쿼리가 잘못됨.**
- 근본: `usePrecedents`(hooks/use-precedents.ts:58)가 `query = "${lawTitle} ${articleNumber}"` + `exact=1`로 판례 **키워드검색**. articleNumber는 법령뷰어 표시포맷 `"제38조"`(use-law-viewer-precedents.ts:13→law-viewer.tsx:240 activeArticleNumber).
- 실측(prod): `"관세법 제38조"` exact → **0건** / `"관세법 제38조"` non-exact → 0건 / **`"관세법 38조"`(제 없이) → 3건** / `"관세법"` → **385건**. 즉 `제N조` 토큰이 법제처 판례 키워드검색에 안 걸림.
- fix 방향(택1+α): ①최소=articleNumber에서 `제`/`조` 정규화 또는 법령명 단독 폴백 ②근본=법제처 prec API의 **참조조문/참조법령 필터** 지원여부 조사(target=prec에 JO/참조 파라미터?) → 진짜 '그 조문 인용 판례' ③법령명으로 검색 후 각 판례 참조조문에 해당 조문 포함되는지 랭킹(detail 비용↑). 관련파일: hooks/use-precedents.ts, hooks/use-law-viewer-precedents.ts, app/api/precedent-search/route.ts(:20 exact 처리·:55 target=prec).
- ⚠️'관련 심급'(세션4 PREC-4)과는 다른 경로 — 이건 조문→판례 미니목록(PrecedentSection).

### 2. 모바일 상단 검색바(Cmd+K 모달) 레이아웃 깨짐 (스샷)
Cmd+K 검색 모달서 **'최근 조회'(ViewingHistoryPanel)가 `<Card>`(테두리·그림자·패딩)째 렌더돼 위 '최근 검색' 리스트와 겹쳐 떠 보임**(스프링클러 항목을 가림). 카드-인-드롭다운이라 부유/중첩 느낌.
- fix: Cmd+K 컨텍스트선 패널을 card chrome 없이 평평한 섹션(최근검색처럼)으로 — viewing-history-panel.tsx에 `embedded`/`flat` prop 추가하거나 command-search-modal.tsx(:520 패널 렌더)서 Card 감싸기 제거. 검색 입력 X버튼 위치도 placeholder와 겹침 점검.
- 관련파일: components/command-search-modal.tsx, components/viewing-history-panel.tsx(Card 래퍼 :89).

---

## 🟢 세션5 진행분 (2026-06-28, (e) P2 폴리시 — commit `eefaf73`, main 머지 `bea4608` 배포완료)

**P2 59건 전수 처리** — understand(triage)→implement(파일-disjoint 16그룹 병렬)→adversarial verify(8영역)→fix→re-verify 파이프라인. 타입체크 clean + **688 테스트**. 26파일 변경.

triage 분류: **apply 40 · 안전기본값 적용 7 · skip(범위/by-design) 5 · 이미수정 2 · 보류(제품결정) 5**.

### ✅ 적용(47건) — 클러스터별
- **위임/비교모달**: DELEG-5(중복 스피너 제거+로딩 스켈레톤), F3(전체비교 빈 개정이력 사이드바 접기), F4(다시시도가 보던 리비전 유지), F5(**ESC=참조 한 단계 뒤로**(handleRefModalBack), X=전부 닫기+히스토리/외부ref 초기화 — '전부 닫힘' 버그 해소), F6(검색중 Enter 가드), F7(모바일 개정이력 Select 선택값+오픈/chevron 리셋)
- **조례벤치마킹**: OB-6(지자체 80+ 안내+필터해제 버튼), OB-4(필터 변경 시 체크 유지, **checkedResults=flatResults 기준**으로 배지·비교집합 일치)
- **법령뷰어**: DELEG-4(행정규칙만 위임 조문 auto-switch), LV-3(모바일 액션바 slim-scrollbar), LV-4(바텀시트 마지막 스냅 복원), LV-5(미로드 조문 로딩 스피너—깜빡임 제거)
- **판례**: PREC-6(페이지 변경 시 루트 scrollIntoView+첫렌더 가드), PREC-7(심급 배지 헌재/특허 — **related-cases·reference-modal 양쪽 정렬**)
- **FC-RAG**: FC-RAG-3('Gemini 전환중'→'법령 검색 중'), FC-RAG-4(검색 직후 진행 피드백), FC-RAG-6(中止 터치타깃)
- **별표/별지**: LV-ANNEX-3(행정규칙 별표 에러→info 톤·다시시도 숨김), LV-ANNEX-4(**스캔 PDF도 info 톤**+친절카피, 빨간에러 격하 방지), LV-ANNEX-6(아이콘버튼 aria-label 11곳)
- **결정문리스트**: DEC-F4(해석례/재결례 헤더 위계↑), DEC-F6(행정규칙 헤더 '행정규칙 검색 결과'+종류 배지)
- **타임머신**: TM-5(데스크톱 사이드바 재오픈, **noDiff서도**), TM-6(모바일 글자크기/동기스크롤 컨트롤), TM-7(날짜 점 통일)
- **영향분석**: IMPACT-3(JO 6자리→formatJO), IMPACT-4(행 터치타깃), IMPACT-5(캐시결과 message 노출), IMPACT-6(진행바 role=progressbar)
- **통합검색**: SR-5(콤보박스 aria-expanded/autocomplete), SR-6(0개일 때 ↑↓ NaN 가드 확인), SR-7(최근검색 개별삭제 X)
- **즐겨찾기**: FAV-4(빈상태 안내+별 아이콘), FAV-5(날짜 '개정일:' 라벨+모바일 wrap), FAV-6(커맨드모달 구독), FAV-8(**머지실패 시 로컬보존+orphan 화면유지** — 데이터손실 방지)
- **설정**: SET-F4(쿼터 사전경고), SET-F5(쿼터 초기화 시각·미래만 표기), SET-F6(AI로그 동의 기본 해제), SET-F7(로그아웃 onClick async→.then().catch())
- **조회기록**: VH-3(분류 비우면 복구), VH-4(Cmd+K 50개→캡+**반응형 게이트**), VH-6(삭제 터치타깃), VH-7(**전체삭제 인라인 2단계 확인** — Radix Dialog 제거로 Cmd+K ESC 충돌 회피), VH-8(하이드레이팅 스켈레톤+로그아웃 가드)

### ⏭️ 보류 — 제품/범위 결정 필요(미적용)
- **OB-7**(조례 AI분석 취소): AbortController+취소버튼 인프라(범위 큼)
- **VH-5**(Cmd+K 조회기록 키보드 네비): 패널 제어반전(control inversion) 필요(범위 큼)
- **FAV-7**(FavoritesPanel 死코드): 어디에도 마운트 안 됨 — 전역룰상 삭제금지, 마운트는 제품결정
- **FC-RAG-5**(모바일 재질의 sticky): 화면공간 13%↓·ChatInput 중복 — 디자인 결정/목업 필요
- **PREC-8**(외부판례 외부이탈 경고): 세션4 Toaster 마운트로 기존 toast 경고가 이제 노출될 가능성 — 브라우저 확인 후 판단

### ⬜ 세션5 후속(저우선 nit/미완)
- **PREC-10**: 하단 관련판례 '전체검색으로 더보기' 카피 개선했으나 `onShowMore`가 호출부(law-viewer-single-article)서 **미배선=현재 미노출**(pre-existing dead block). 노출하려면 law-viewer→판례검색 네비 plumbing 필요.
- **DELEG-4 edge**: 행정규칙 토글 on→off 후 다른 rule-empty 조문 열면 캐시로 auto-switch가 admin탭 가되 showAdminRules 미설정→'이 탭을 선택하세요' 모순(좁은 시퀀스, 다른 탭 차단은 안 함). 픽스=auto-switch 시 setShowAdminRules(true) 보장(three-tier 훅 수술 리스크).
- **FAV-3**(변경됨 배지): 1줄 스냅샷은 login DB 미저장+영구박제라 오해→**revert함**. 제대로면 lastSeenSignature 실시간 비교 + favorites.has_changes 컬럼(마이그레이션).
- **DEC-F4**: 헤더 위계 올렸으나 형제뷰(sticky 글래스+gradient 배지)와 완전일치는 아님(범위).
- 기타 nit: PREC-7 특허'2심' 단정·DECF6 행정규칙 판정 results[0] 의존·FC-RAG-6 터치타깃 44px 미달·IMPACT-4 중첩스크롤.

---

## 🟢 세션4 진행분 (2026-06-27, commit `78e5881`)

**잔여 디자인 5건 전부 완료** + 적대적 검증 5건(understand→implement→verify 워크플로우) 통과. 타입체크 clean + **688 테스트**(favorites-store 복원 5건 신규).

| ID | 적용 요지 | 상태 |
|---|---|---|
| **FAV-2** | `removeFavorite` 삭제항목 반환 + `restoreFavorite`(원본 재삽입, id/createdAt 보존, index 위치복원). dialog/panel handleRemove→`useToast`+`<ToastAction>` undo 토스트. 휴지통 `min-h-10 min-w-10`(40px), 패널 아이콘 h-4 | ✅ |
| **SR-3** | `allTourSteps`→`tourSteps = allTourSteps.filter(...)`. 모바일(`innerWidth<640`)서 숨겨진 `ai-toggle` 단계 제외 (배열 리터럴 분리로 TourStep[] 추론 유지) | ✅ |
| **PREC-2** | placeholder '결과 내 검색...'→'이 페이지에서 찾기' + 빈상태 카피 '결과 내 검색은'→'이 페이지에 보이는' 용어 통일. 필터/페이지네이션 로직 불변 | ✅ |
| **F2** | 해석례/재결례 응답 `totalCount` state 보존(useSearchState +2 state/+2 setter, clearSecondary·reset 커버) → 배지 '전체 N건 (상위 M건)' (totalCount>length일 때만, ternary라 0/undefined 누수 없음) | ✅ |
| **PREC-4** | 헤더 '관련 심급'→'같은 사건명 판례', 빈상태 일관, N≥3 캐비엇 '사건명이 같은 판례예요 · 같은 사건이 아닐 수 있어요'. **`use-related-precedent-cases.ts` 필터 로직 불변(보호)** | ✅ |

### ⚠️ 세션4 핵심 발견 — 토스트 렌더러 미마운트 (잠복 버그, 해결)
`useToast`/`toast()`(hooks/use-toast.ts) + Radix primitives(components/ui/toast.tsx)는 있는데 **`<Toaster/>`(렌더러)가 app/layout 어디에도 없었음** → 기존 `toast()` 호출(law-viewer 복사완료·delegation 패널·useUnifiedSearch 검색피드백/에러 등) **전부 화면에 안 뜨던 상태**(shadcn 보일러플레이트 누락). FAV-2 undo가 여기 의존.
→ **사용자 승인 하에** 표준 `components/ui/toaster.tsx` 신설 + `app/layout.tsx` 마운트. 부수효과로 기존 toast 전부 활성화(=잠복버그 수정). **TOAST_LIMIT=1**이라 동시 1개만 노출(빠른 다중삭제 시 직전 undo 토스트 대체됨 — 수용).
**+ user 모드 undo DB 경합 수정**: `removeFavorite` delete(async)와 `restoreFavorite` insert(같은 PK)가 경합해 행 유실 가능 → `pendingDeletes` 맵으로 insert를 delete 뒤로 직렬화(`Promise.resolve`로 thenable 1회 실행).

### ⬜ 세션4 후속(저우선·코드밖/범위큼)
- **PREC-4b**(심급 배지): 헤더는 '같은 사건명 판례'로 정직화됐으나 칩 배지는 여전히 court 추정 '3심/2심/1심'(동일사건 항소체인 단정). 헤더+캐비엇이 맥락상 완화하나 완전정직은 배지를 '대법원/고등/지법' 법원종류로 바꿔야(기존 코드·색상시스템 연동이라 별도 처리).
- **F2 캐시복원 totalCount**: 새로고침/뒤로가기 복원 시 totalCount 0폴백 → 배지 'M건'(회귀 아님, 기존 precedentTotalCount도 동일 미커버). 유지하려면 `SearchResultCache`에 필드 추가+persist/복원(precedent와 일괄).
- **SR-3 resize 엣지**: 데스크톱서 투어 시작 후 640미만으로 축소 시 ai-toggle 단계 빈모서리 재발 가능(모바일 실사용선 무관). 강건화하려면 OnboardingTour가 rect width/height=0이면 hasTarget=false 처리.

---

## 🟢 세션3 진행분 (2026-06-27, commits `24b8a30` + `dd72702`)

### (d) partial 3건 완전수정 — commit `24b8a30`
직전 세션이 회귀 리스크로 이관했던 PREC-3/DELEG-1/VH-2 완성. **fix별 독립 적대적 리뷰** 후 실이슈 반영:
- **PREC-3**: `SearchResultCache.precedentSearchParams` + `seedPrecedentSearchParams` 훅 노출. 새로고침(loadSearchResult 판례 리스트 복원 블록)/뒤로가기(restorePrecedentResults) **양쪽**에서 ref 시드 → 복원 후 페이지네이션이 court/caseNumber/정제쿼리 유지. (리뷰 캐치: F5가 precedentResults early-return에 가려져 미해결이던 것 → F5 블록에도 시드. classification 보존안은 무관한 동작변경이라 철회.)
- **DELEG-1**: three-tier 훅 `hasLoadedAdminContent` → 시행령·시행규칙 모두 빈 "행정규칙만 위임" 조문서 admin 자동전환(로드 전 대기, 경합 방지). **리뷰 실회귀 수정**: `delegationActiveTab`이 패널닫힘/조문·법령변경 시 미리셋이라 1회 전환 후 가드에 막혀 stale 탭으로 열림 → 1-tier 복귀 시 decree 리셋.
- **VH-2**: `ordinanceSeq` plumbing(ReviewQuery→SearchQuery→cache) → 조례 직접 재오픈, 실패 시 폴백. (리뷰 `solid`.)
- 검증: 타입체크 clean + **683 테스트** (674→+9). 적대적 리뷰 3건 통과.

### (a) 디자인 P1 절반 6건 — commit `dd72702` (추천안 자율 적용)
빈상태/피드백/막다른길 클러스터. feedback-design-vitality 준수.
- **PREC-5**(PrecedentResultList): 빈상태 컨텍스트별 회복(필터 0건→'필터 지우기'+현재페이지만 안내, 무결과→onBack).
- **F1**(해석례/재결례, index.tsx 게이트 `!==null` + SearchResultList): 0건 제네릭에러→도메인 빈상태 + 'AI 검색으로 다시 시도'(handleAiQuery 배선).
- **F3**(SearchResultList): 해석례/재결례 카드 external-link 아이콘+title 외부이탈 예고.
- **TM-2**(time-machine-modal): 신구대조표 없는 개정 throw→`noDiff` 정보상태 차분 안내(사이드바 유지).
- **OB-1**(ordinance-benchmark-view): progress 전 첫페이지 구간 경량 로딩카드.
- **settings F2**(privacy-settings-dialog): 방치된 ApiKeyInput을 BYOK 섹션으로 노출(user-menu '개인정보 설정' 경유, 로그인/비로그인 공통).
- 검증: 타입체크 clean + 683 테스트 무회귀. **시각검증(프리뷰 브라우저) 핸드오프.**

### ✅ 잔여 디자인 5건 (세션4 `78e5881`로 전부 완료 — 상세는 위 세션4 섹션)
<details><summary>당시 발굴 권장안(참고용, 펼치기)</summary>
- **FAV-2**(`favorites-dialog.tsx`/`favorites-panel.tsx`/`favorites-store.ts`): 삭제 undo 없음+모바일 오탭. handleRemove서 원본 보관→useToast '삭제됨·실행취소' 액션(store에 restore 헬퍼 추가해 id/createdAt 보존) + 휴지통 히트영역 min-h-10/min-w-10.
- **SR-3**(`search-view.tsx`): 모바일서 AI토글 없는데 온보딩이 빈 모서리 가리킴. (A·추천) tourSteps 구성 시 `window.innerWidth<640`이면 ai-toggle 단계 filter 제외(저위험). (B) 모바일 brain 토글 노출(레이아웃 큼).
- **PREC-2**(`PrecedentResultList.tsx`): '결과내검색'이 현재페이지 20건만. placeholder→'이 페이지에서 찾기' + filterKeyword 빈결과 분기를 서버 빈결과와 구분(이미 PREC-5서 절반 처리됨 — 문구만 정리). 근본(전체검색)은 서버 API 동반 범위 큼.
- **F2 해석례/재결례 페이지네이션**(`useUnifiedSearch.ts`/`SearchResultList.tsx`/`useSearchState.ts`): 항상 상위20건+총건수 미표시. 최소안=totalCount state 보존+배지 '전체 N건(상위 20건)'. 완전안=OrdinanceSearchResultList 서버 페이지네이션 패턴 이식(state/persistSearchCache 구조변경, 범위 큼).
- **PREC-4**(`law-viewer-related-cases.tsx`/`use-related-precedent-cases.ts`): 관련심급이 사건명 완전일치라 오표시. 안전안=라벨 '관련 심급'→'같은 사건명 판례'+N건이상 '같은 사건 아닐 수 있음' 안내. ⚠️필터 로직(사건번호 stem 매칭)은 진짜 심급 떨굴 회귀위험 — 카피만 권장.
</details>

### 미진행 상위 후보 (세션5+) — **순서: (e) → (b)** (사용자 지시: e먼저, 테스트 나중)
- **(e) P2 폴리시 59건** ⏭️다음: `p2-list.txt`. 즐겨찾기·조회기록 각 6, 비교/참조모달·조례·판례 각 5 등 다듬기.
- **(b) 프리뷰 브라우저 검증** (e 다음): VH-1/TM-1/ANNEX-1/별지/현행성 + 디자인(세션3 6건+세션4 5건) 시각확인. **+ 토스트 신규활성 확인**: FAV-2 삭제→'실행취소' 토스트 뜨고 클릭 시 복원되는지, 기존 toast(복사완료/검색피드백)도 정상 노출/위치/테마 OK인지 (코드불가, 프리뷰 URL+브라우저).
- **(c) LP-2 크로스레포**: korean-law-mcp는 **npm published v4.4.2**(pnpm) 확정 → 소스수정+빌드+publish+lexdiff bump 필요. efYd는 lexdiff tool-adapter가 이미 백스톱(부분중복). ROI 낮음.

---

## 🟢 세션2 진행분 (2026-06-27, commit `3b3421f`)

**잔여 P1 비디자인 9건 surgical 완료** — 7클러스터(파일 disjoint) 구현→독립 적대적 리뷰 파이프라인. 타입체크 clean + 674테스트 통과. 아래 9건은 ⬜ 잔여 목록에서 제외됨:

| ID | 적용 요지 | 상태 |
|---|---|---|
| SR-2 | 자동완성 실패 시 빈화면→에러행 | ✅ |
| SR-4 | fetchSuggestions 두 경로 AbortController(옛결과 덮어쓰기 차단) | ✅ |
| VH-2 | 조례 재조회 평문검색 누수 차단(조례모드 라우팅) | ✅ partial¹ |
| PREC-1 | 관련심급 재토글 빈손 → lastSearchedNameRef 무효화 | ✅ |
| PREC-3 | 판례 페이지2+ 정제쿼리+court/caseNumber 유지(fresh 경로) | ✅ partial¹ |
| FC-RAG-2 | 프로그레스 75고정→토큰길이 75→90 점근+단조 역행가드 | ✅ |
| DELEG-1 | 위임패널 빈 시행령탭→내용있는 탭 1회 자동전환(ref 가드) | ✅ partial¹ |
| LV-1 | 전체보기 스크롤→activeJo 역추적(디바운스+2겹 루프가드) **+ 모바일/데스크톱 중복마운트 가시성 가드** | ✅ |
| LV-2 | 사이드바 점프 `*60` 하드코딩→`scrollToIndex(center)` 측정값 | ✅ |

¹ **후속 이관 (각 proposal이 최소범위로 허용, baseline 대비 회귀 없음)**:
- **PREC-3**: fresh 검색→페이지네이션은 고침. **캐시복원(새로고침/뒤로가기) 후 페이지네이션**만 court/caseNumber 유실 — 완전수정엔 `SearchResultCache` 스키마에 court/caseNumber 추가 + `restorePrecedentResults`(index.tsx:379)에서 `precedentSearchParamsRef` 시드(훅 API 노출) 필요.
- **DELEG-1**: 시행규칙 케이스 고침. **행정규칙'만' 위임된 조문**은 여전히 빈 시행령탭(adminRules가 별도 비동기 훅이라 동기 전환 리스크 — 리뷰 경고).
- **VH-2**: 평문검색 누수 차단. **동일 조례 ordinanceSeq 직접 재오픈**은 미구현(현재 조례모드 재검색까지 — 같은 이름 다지자체면 재선택 필요).

**LV-1 리뷰 캐치(수정완료)**: 모바일(`md:hidden`)+데스크톱(`hidden md:block`) LawViewer가 동일 props로 동시 마운트(index.tsx:653/676)되는데 전역 `window` CustomEvent를 숨은 인스턴스도 수신 → 루트 div `viewerRootRef`에 `offsetParent===null` 가시성 가드 추가.

**LP-2 조사 완료(미적용)**: `korean-law-mcp/src/tools/batch-articles.ts` 124줄(resultText 초기화) 직후에 `law-text.ts:117-127` 현행성 라벨(efYd/시행예정/조회기준일) ~10줄 미러링. efYd 케이스만 lexdiff `tool-adapter.ts:194-206` 백스톱과 cosmetic 이중라벨(무해). ⚠️**적용 전 선결**: lexdiff가 korean-law-mcp를 npm published로 의존하는지 file/git 링크인지 재확인(CLAUDE.md는 "tools/* 직접 import"라 함 — 조사 에이전트는 npm 가정). korean-law-mcp 현재 v4.4.2 → bump+build 필요.

---

## 🔴 현행성(과거법령 오답) 감사 — 결과

**루트원인**: `get_batch_articles`·`search_ai_law`(1순위 검색도구)가 현행성 라벨을 안 붙이는데 `get_law_text`·`search_law`만 붙임. 프롬프트 가드가 "라벨 있을 때만" 작동 → 1순위 도구로 우회 가능. + 프로그램적 백스톱 전무(quality-evaluator 현행성 무지, forceLastTurn 평가 스킵, answer-cache 6h 증폭).

### ✅ 적용한 수정 (전부 lexdiff 내부, surgical, 테스트됨)
| ID | 수정 | 파일 |
|---|---|---|
| TL-1/TL-2 | `get_batch_articles(efYd)`·`get_historical_law` 무라벨 → ⚠️ 현행성 라벨 주입(law-text 미러링) | `lib/fc-rag/tool-adapter.ts` |
| LEAK-1/LP-5 | quality-evaluator 현행성 백스톱: 연혁/시행예정 마커 + 답변 미반영 → marginal 강등 + 경고(캐시 저장 차단=LEAK-4 자동해결) | `lib/fc-rag/quality-evaluator.ts` |
| LEAK-2 | forceLastTurn 경로에 품질평가 추가(백스톱 미적용 갭 제거) | `lib/fc-rag/gemini-engine.ts` |
| LP-1b | 무라벨 pre-evidence(search_ai_law) 단독 즉답 차단 | `lib/fc-rag/gemini-engine.ts` |
| LEAK-3 | "시행일 > 오늘 = 시행예정본" 계산 규칙(라벨 유실 집계 출력까지 커버) | `lib/fc-rag/prompts.ts` |
| PREC-1 | 판례 인용 구(舊) 조문은 "구 「법명」(YYYY 개정 전)"으로 현행과 구분 표기 | `lib/fc-rag/prompts.ts` |
- 재현 테스트: `__tests__/lib/fc-rag/quality-evaluator.test.ts`(+5), `tool-adapter.test.ts`(+3, 라벨 주입).

### ✅ 안전 확인된 경로 (수정 불요)
- 라벨 배선: static 프롬프트 현행성 섹션 + raw tool_result가 모델에 정상 도달(요약문은 UI 전용). MST 선택은 현행 편향(search 정렬+findBestMST+correctToolArgs) 양호. compare_old_new/get_law_history는 라벨 양호. citation content-mode·별표 모달·법령뷰어 구법 경로(amber 경고)는 현행 anchored.

### ⏭️ 크로스레포 핸드오프 (korean-law-mcp — 진짜 루트픽스, 별도 릴리스 필요)
`~/workspace/korean-law-mcp` 소스 수정 → 빌드 → 버전 bump → lexdiff 의존성 갱신. lexdiff 테스트로 검증 불가라 이번 세션 제외.
- **LP-2**: `batch-articles.js fetchArticlesForLaw`가 `law-text.js:94-113`의 현행성 라인(구법령명/⚠️시행예정/⚠️efYd/ℹ️조회기준일)을 미러링하도록(~12줄). → LLM이 연혁 MST를 골라 get_batch_articles 호출하는 케이스의 무라벨 근본 차단. (현재는 lexdiff tool-adapter가 efYd 케이스만 라벨링)
- **LP-1a**: `life-law.js renderAiLawSearchResult`에 '현행/연혁 미구분 — search_law로 [현행] 재확인' 푸터.
- **LP-3**: `lib/search-normalizer.ts`에 RENAMED_LAWS(구명/분법명→현행명) 맵 + `prompts.ts`에 detectRenamedLaws 블록. (소방·화재 분법 등 빈출 수건. lexdiff 내부지만 데이터 큐레이션 필요해 보류)

---

## 🎛️ UX 마찰 — 우선순위 + 적용/잔여

### ✅ 적용 (P0 3 + P1 3, 검증됨)
| ID | 마찰 | 수정 |
|---|---|---|
| **VH-1**(P0) | 판례 재조회가 사건번호를 법령명으로 검색→0건 | `viewing-history-store.ts` toReviewQuery에 precedent classification 주입 + 테스트 4건 |
| **TM-1**(P0) | 타임머신 '이력 N건' 토글 모바일서 죽음 | `time-machine-modal.tsx` 모바일 전용 개정이력 오버레이 |
| **ANNEX-1**(P0) | 번호없는 '별표 보기'가 빈 모달 dead-end | `annex-modal.tsx` 가드 완화→폴백(첫 별표) |
| **F1**(P1, quota) | 쿼터 메시지에 내부키(fc_rag…) 노출 | `quota.ts`+`api-auth.ts` 한글 라벨 |
| **SR-1**(P1) | Cmd+K 키보드가 안 보이는 즐겨찾기 선택 | `command-search-modal.tsx` 표시범위(5)로 한정 |
| **DELEG-2**(P1) | 위임 0건인데 "모두 정상" 오해 | `delegation-gap-modal.tsx` 중립 표시 |

### ⬜ 잔여 P1 — 비디자인 (17, 다음 세션 surgical 후보)
> 각 항목 file:line·재현·수정안은 `.claude/plans/2026-06-27-ux-review-data/ux-p0p1.json`에 상세.
- **DELEG-1**(flow): 위임패널 항상 '시행령' 탭 → 시행규칙만 있는 조문서 빈 화면. `use-law-viewer-three-tier.ts`
- **F1**(empty-error): 법령선택 다이얼로그 검색에러=결과없음과 동일+재시도 없음. `law-selection-dialog.tsx`
- **OB-2**(logic): 지역 전체해제 시 추천칩이 가드 우회. `ordinance-benchmark-view.tsx`
- **LV-1**(flow): 전체보기 스크롤 시 현재위치 미추적(사이드바·헤더 고정). `virtualized-full-article-view.tsx`
- **LV-2**(logic): 사이드바 점프가 고정 행높이(60px) 가정 → 긴 법령서 화면밖 안착. `virtualized-article-list.tsx`
- **PREC-1**(logic): 관련심급 버튼 토글 재켜면 빈손. `use-related-precedent-cases.ts`
- **PREC-3**(logic): 판례 2페이지+ 다른 쿼리/필터로 어긋남. `useUnifiedSearch.ts`
- **FC-RAG-1**(flow): 中止가 부분답변 버리고 AI화면 언마운트. `useAiSearch.ts`
- **FC-RAG-2**(perf): 스트리밍 내내 프로그레스 75% 고정. `useAiSearch.ts`
- **TM-8**(copy): '타임머신/시점복원' 카피가 실기능 과약속. `law-viewer-analysis-menu.tsx`
- **IMPACT-1**(logic): 영향 항목 행이 클릭가능해 보이나 죽은 클릭. `impact-analysis-panel.tsx`
- **IMPACT-2**(empty-error): 다중법령 분석 일부 실패가 안 보임. `use-impact-tracker.ts`
- **SR-2**(empty-error): 자동완성 에러 안 보임→먹통 체감. `command-search-modal.tsx`
- **SR-4**(perf): 자동완성 요청취소 없어 느린망서 옛결과가 새결과 덮음. `useSearchBarState.ts`
- **FAV-1**(empty-error): 로그인 즐겨찾기 동기화 실패 무음. `favorites-store.ts`/`favorites-sync.tsx`
- **F3**(flow): 게이트서 BYOK 등록해도 원래 검색 미이어짐. `ai-gate-*.ts`
- **VH-2**(flow): 조례 재조회가 ordinanceSeq 버리고 조례명 재검색(VH-1 자매건, ordinance classification 필요). `viewing-history-store.ts`

### 🎨 디자인 P1 — 스샷 라운드 (헤드리스 목업 2~3안 → 사용자 선택)
**✅ 적용 (4건, 사용자 선택 방향)**: F2 신구대조 모달 모바일 92dvh(B안)·LV-ANNEX-2 별표 하단 툴바(A안)·OB-3 조례 카드형(A안)·TM-3/TM-4 개정이력 모달 반응형+새창. 목업 png: `scratchpad`(세션) — 방식은 HTML 목업+headless chrome 캡처.
**⬜ 잔여 (12건, 다음 스샷 라운드)**: feedback-design-vitality 준수. 해석례 외부탭 이탈(F3)·20건 잘림+페이지네이션 없음(decisions F2)·제네릭 오류(decisions F1), 신구대조 없는 개정 '에러' 표시(TM-2), 판례 '결과내검색' 20건만(PREC-2)·관련심급 오표시(PREC-4)·빈상태 제각각(PREC-5), 즐겨찾기 undo 없음/오탭(FAV-2), 온보딩이 없는 AI토글 가리킴(SR-3), 쿼터소진 막다른 CTA(settings F2), 조례 첫검색 공백(OB-1).

### 🧹 P2 폴리시 백로그 (59건) — `.claude/plans/2026-06-27-ux-review-data/p2-list.txt`
즐겨찾기·조회기록 각 6, 비교/참조모달·조례·판례 각 5 등. 다듬기.

---

## 🤖 Gemini API 버전 (검토 결과)
- 현재: `@google/genai` 1.46.0(최신 2.10.0, 메이저 1단계 뒤) / primary `gemini-3-flash-preview`(**preview**, 셧다운 미정) / lite `gemini-3.1-flash-lite`(**GA** ✓).
- 권고: 당장 swap 불요(preview 셧다운 미정·저비용). 단 GA 안정화하려면 `gemini-3.5-flash`(GA, 더 비쌈)로 A/B — `GEMINI_MODEL` env override가 있어 **프리뷰 배포에만** 세팅해 지연·비용·현행성 정확도 비교. 마이그레이션 함정: `thinkingBudget`→`thinking_level:'minimal'`(3.5 기본 medium=느림), FC `id` 매칭 엄격화(현재 functionResponse에 id 없음), temp 변경 비권장. SDK 2.x는 별도 통제 업그레이드.

---

## 🌐 프리뷰 브라우저 검증 체크리스트 (코드/단위테스트로 불가)
1. **VH-1**: 판례 본 뒤 홈/Cmd+K '최근 조회'서 판례 클릭 → 그 판례 결과가 다시 뜨는지(사건번호 검색).
2. **TM-1**: 모바일 폭에서 타임머신 → '이력 N건' 탭 → 개정 목록 오버레이 뜨고 선택 시 해당 신구대조로 전환되는지.
3. **ANNEX-1**: 법령뷰어 액션 '별표' (번호 없는) → 모달에 첫 별표가 뜨는지(빈 모달 아님).
4. 별지: "별지 제N호서식" 클릭 → 서식 본문(PDF/HWP) 렌더(직전 핸드오프 잔여).
5. 현행성: 최근 개정/분법 질의(예 소방시설법 분법, efYd 과거)로 답변이 연혁을 현행으로 단정 안 하는지 + confidence/경고 반영.

---

## 다음 세션 시작 프롬프트
```
lexdiff(브랜치 feat/prod-review-viewing-history) UX 리뷰 이어가자.
.claude/plans/2026-06-27-ux-review-handoff.md '세션4 진행분' 읽어 — 잔여 디자인 5건(FAV-2/SR-3/PREC-2/F2/PREC-4)
+ 토스트 인프라 복구(Toaster 마운트)는 commit 78e5881로 완료(타입체크+688테스트 그린, 적대적 리뷰 통과).
이번 세션: (e) P2 폴리시 59건부터 — `.claude/plans/2026-06-27-ux-review-data/p2-list.txt`.
 추천안으로 알아서 다듬기(feedback-design-vitality 준수), 클러스터별 surgical, 수정 후 항상 타입체크+테스트, 끝나면 자동커밋.
그 다음 (b) 프리뷰 브라우저 검증 ← 토스트 신규활성(FAV-2 undo/기존 toast) + 디자인 11건 + VH-1/TM-1/ANNEX-1/현행성 한 방에.
함정: Hermes 비활성·Gemini only, 판례/링크 2경로, .claude/plans는 gitignore(로컬만), TOAST_LIMIT=1.
세션4 후속(저우선): PREC-4b 심급배지·F2 캐시복원 totalCount·SR-3 resize 엣지(세션4 섹션 참조).
상세 발굴데이터: .claude/plans/2026-06-27-ux-review-data/ (ux-p0p1.json, ux-findings.json, currency-findings.json).
```
