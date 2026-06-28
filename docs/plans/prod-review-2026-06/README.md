# 프로덕션 리뷰 #2 — UX 워크플로우 + 현행성 감사 (2026-06)

> 원래 `.claude/plans/`(gitignore, 로컬전용)에 있던 문서를 다른 PC 연속작업용으로 추적 위치로 이동.

## 진입점
- **[2026-06-28-prod-review-before-after-report.md](2026-06-28-prod-review-before-after-report.md)** — 세션1~6 전후비교 상세 보고서 (최종 산출물). 검증결과·핵심지표·적대적 회귀검증·ROI·잔여리스크. **여기부터 읽으면 전체 그림.**
- **[2026-06-27-ux-review-handoff.md](2026-06-27-ux-review-handoff.md)** — 세션1~6 전 과정 핸드오프 (각 세션 변경분·발굴데이터·다음세션 프롬프트). 가장 상세한 작업기록.

## 보조 문서
- `2026-06-27-prod-review-handoff.md` — 직전(리뷰#2 초기) 핸드오프
- `2026-06-27-next-ux-workflow-review.md` — UX 워크플로우 리뷰 계획
- `2026-06-27-ux-review-data/` — 발굴 원천데이터 (ux-p0p1.json, ux-findings.json, currency-findings.json, p2-list.txt)

## 현재 상태 (2026-06-28 기준)
- 세션1~6 **프로덕션 배포 완료** (`main` 2.4.1-beta).
- **관련판례 0건→N건 픽스 작동 확정** (프로덕션 빌드 실측: 관세법 제38조 28건). dev의 0건은 React StrictMode 더블인보크 아티팩트(prod 무관).
- **Cmd+K Enter 즐겨찾기 OOB 크래시 픽스 배포됨** (`3efbadc`, main 머지+푸시).
- 검증: 타입체크 clean + 693 테스트.

## 남은 작업 (다음 세션 후보)
- **P1** — FAV-8/VH 게스트 즐찾·이력 비-UUID id(`${Date.now()}-${Math.random()}`) → uuid 컬럼 머지/삭제 영구실패. `crypto.randomUUID()` 부여 또는 머지 payload에서 id 제외. (보고서 §4-B)
- **수동 스팟체크** — 보고서 §6 목록(토스트 시각·모바일 Cmd+K·현행성 e2e·VH-1/TM-1/ANNEX-1).
- **P3 보류** — 본문검색 오탐 정밀화(보고서 §5, ROI 낮음).

> ⚠️ 함정 메모: Hermes 비활성·Gemini only / 판례·링크 2경로 / TOAST_LIMIT=1 / 본문검색=구문→AND폴백(오탐 잔존) / 커밋·푸시는 사용자 확인 후 main.
