# Lessons Learned

| 상황 | 실수 | 교훈 | 방지 규칙 |
|------|------|------|----------|
| pre-evidence 도입 시 moderate 쿼리 | "즉답 모드" 지시문 + 턴 제한(5턴)을 moderate에도 적용 → Claude가 불충분한 데이터로 38자 답변 생성 | simple과 moderate의 pre-evidence 전략은 달라야 함. simple은 "즉답", moderate는 "참고자료+적극 보충" | moderate+evidence는 턴 제한 풀고 "참고자료 모드" 지시문 사용 |
| consequence pre-evidence | 쿼리에서 법명 추출 시 `/([\w가-힣]+법)/` 사용 → "해고예고수당 벌칙"에는 "법"이 없어서 miss | 법명은 쿼리가 아닌 search_ai_law 결과에서 추출해야 함 | pre-evidence 보충 시 `aiSearch.result.match(/📜\s+(.+)/)` 우선 사용 |
| Gemini auto-chain | functionCall 파트를 수동 생성(`{ functionCall: { name, args } }`)하여 모델 메시지에 추가 | Gemini 2.5 Flash는 thought_signature 필수 — 수동 생성 파트에는 없어서 400 에러 | auto-chain 결과는 functionCall 위장 대신 텍스트(`[보충 조회: ...]`)로 주입 |
| inferComplexity | "벌칙", "요건", "비과세" 등이 moderate 패턴에 없어서 simple로 분류 → pre-evidence 3턴으로 답변 부족 | 법적 판단이 필요한 queryType(consequence, exemption, requirement)은 최소 moderate | moderatePatterns에 벌칙/처벌/과태료/면제/비과세/요건 추가 |
| Vercel pdfjs-dist | DOMMatrix polyfill을 import 문과 같은 파일에 인라인으로 작성 → ES 모듈 호이스팅으로 import가 먼저 실행되어 polyfill 무효 | ES 모듈에서 import는 코드보다 먼저 호이스팅됨. polyfill은 반드시 별도 파일로 분리하여 import 순서 보장 | polyfill → 별도 .ts 파일 → 대상 모듈 import 전에 import |
| Vercel pdfjs-dist workerSrc | `GlobalWorkerOptions.workerSrc = ""` 설정했는데 pdfjs v5가 falsy면 기본값으로 덮어씀 → fake worker의 dynamic import 실패 | pdfjs v5는 `workerSrc \|\|=`로 빈 문자열을 무시. `globalThis.pdfjsWorker`에 worker를 미리 주입하면 import 자체를 건너뜀 | globalThis.pdfjsWorker에 static import로 worker 모듈 사전 주입 |
| 법제처 HWPX 확장자 | 법제처가 HWPX(ZIP) 파일을 .hwp 확장자 + content-type "hwp"로 전송 → annex-pdf가 X-File-Type: hwp 반환 → 모달이 "구 HWP" 다운로드 UI 표시 | 파일 타입은 content-type이 아닌 magic bytes로 판별해야 함. ZIP(PK) = HWPX ≠ OLE2(D0CF) = HWP5 | annex-pdf에서 ZIP magic bytes 체크하여 hwpx/hwp 구분 |
| FC-RAG Primary 경로 식별 | 파일명/함수명(`claude-engine.ts`, `executeClaudeRAGStream`, `callAnthropicStream`)과 옛 주석("Claude CLI subprocess stream-json")만 보고 Anthropic Claude CLI를 spawn한다고 판단 | 네이밍은 legacy일 수 있음. 실제 LLM 경로는 클라이언트 모듈(`hermes-client.ts`)의 import 체인과 fetch 대상으로 확인해야 정확함 | LLM 경로 단정 전에 ① 클라이언트 파일 헤더 ② fetch URL ③ `child_process.spawn` grep 3가지 교차검증 |
