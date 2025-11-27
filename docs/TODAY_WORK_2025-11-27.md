# 2025-11-27 작업 완료 및 다음 단계

**작성일**: 2025-11-27
**작업 시간**: 오후
**상태**: 구현 완료, 테스트 대기 중

---

## ✅ 오늘 완료한 작업

### 1. RAG 프롬프트 재설계 완료

**문제점**:
- AI 답변에 메타 지시사항이 그대로 노출됨
  - 예: "📋 핵심 요약 (2줄)" → 답변에 "(2줄)" 텍스트 표시
  - 예: "- ✅ 해당 조문의 핵심 내용 1줄" → "1줄" 지시가 답변에 포함

**해결 방법**:
- 메타 지시사항을 "주의사항" 섹션으로 분리
- 4가지 질문 유형별 프롬프트 템플릿 재작성 (specific/general/comparison/procedural)
- HTML 변환 로직과 100% 호환 유지

**수정 파일**:
- `lib/file-search-client.ts` (Line 230-326: PROMPT_TEMPLATES)
- `docs/RAG_PHASE_4-6_TEST_GUIDE.md` (테스트 가이드 추가)

**커밋**:
- `ef72e31`: feat: RAG 프롬프트 재설계 - 메타 지시사항 분리 및 구조화 개선
- ✅ 빌드 성공
- ✅ GitHub 푸시 완료

---

## 🧪 다음 단계: 테스트 필수

### ⚠️ 중요: 캐시 삭제 먼저!

테스트 전에 **반드시** 기존 캐시를 삭제해야 새 프롬프트 효과를 확인할 수 있습니다.

**방법 1: Chrome DevTools**
1. F12 → Application 탭
2. Storage → Clear site data 클릭
3. "Clear site data" 버튼 클릭

**방법 2: IndexedDB 직접 삭제**
1. F12 → Application 탭
2. Storage → IndexedDB → `lexdiff-rag-cache` 우클릭
3. "Delete database" 클릭

---

### 테스트 쿼리 4가지

개발 서버 재시작 후 다음 쿼리들을 AI 검색에 입력:

#### 1. "관세법 제38조" (specific 타입)

**예상 결과**:
- 조문 전문 인용 (모든 항·호 포함)
- blockquote로 법령 원문 표시

**확인 사항**:
- [ ] Console에 `queryType: "specific"` 로그 표시
- [ ] 답변에 "(2줄)", "1줄" 등 메타 지시사항 **없음**
- [ ] 4개 섹션 (📋📄💡🔗) 정상 표시
- [ ] ⚖️ 조문 발췌 부분이 blockquote로 렌더링

---

#### 2. "수출통관 절차는?" (procedural 타입)

**예상 결과**:
- 단계별 설명 (1단계, 2단계, 3단계)
- 💡 추가 참고 섹션 포함
- 🔴 조건·예외 섹션 포함

**확인 사항**:
- [ ] Console에 `queryType: "procedural"` 로그 표시
- [ ] 답변이 단계별로 구조화
- [ ] 필요 서류, 기한 정보 포함
- [ ] 메타 지시사항 미노출

---

#### 3. "관세법과 시행령 차이" (comparison 타입)

**예상 결과**:
- A vs B 명확한 대비 구조
- 🔴 조건·예외 섹션 포함
- 차이점 구체적 나열

**확인 사항**:
- [ ] Console에 `queryType: "comparison"` 로그 표시
- [ ] "A는 ~이지만, B는 ~입니다" 형식의 비교
- [ ] 차이점이 명확히 대비됨
- [ ] 메타 지시사항 미노출

---

#### 4. "환급 제도" (general 타입)

**예상 결과**:
- 여러 법령 종합
- 💡 추가 참고 섹션 포함
- 핵심 항만 발췌 (전문 인용 아님)

**확인 사항**:
- [ ] Console에 `queryType: "general"` 로그 표시
- [ ] 여러 관련 법령이 종합적으로 인용
- [ ] 실무 적용 가이드 포함
- [ ] 메타 지시사항 미노출

---

### Chrome Console 로그 확인 방법

F12 → Console 탭에서 다음 로그 확인:

```
[File Search] Query preprocessing: {
  original: "관세법 제38조",
  processed: "관세법 제38조",
  type: "specific",
  laws: ["관세법"],
  articles: ["제38조"],
  confidence: 1
}

[File Search] Metadata Filter applied: law_name CONTAINS "관세법"
```

---

## 📊 검증 체크리스트

### 렌더링 확인
- [ ] 4개 섹션 헤더 정상 표시 (📋📄💡🔗)
- [ ] blockquote 정상 생성 (⚖️ 조문 발췌 트리거)
- [ ] 하위 아이콘 SVG 변환 (✅📌🔔⚖️📖📝🔴📜)
- [ ] 법령 링크 정상 생성 (「법령명」 클릭 가능)

### 내용 품질 확인
- [ ] **메타 지시사항 미노출** ("2줄", "1줄" 등 **절대 없어야 함**)
- [ ] 질문 유형별 차별화 확인 (내용 범위)
- [ ] 컴팩트한 답변 (불필요한 장황함 없음)

### 호환성 확인
- [ ] HTML 파싱 오류 없음
- [ ] 모바일 레이아웃 정상
- [ ] 접기/펼치기 기능 정상 (blockquote)

---

## 🐛 문제 발생 시

### 문제 1: 메타 지시사항이 여전히 보임

**원인**: 캐시 미삭제
**해결**: IndexedDB `lexdiff-rag-cache` 삭제 후 재테스트

---

### 문제 2: Console에 로그가 안 보임

**원인**: 로그 필터 설정
**해결**: Console 필터를 "All levels"로 설정

---

### 문제 3: blockquote가 안 보임

**확인 사항**:
1. AI 답변에 "⚖️ 조문 발췌" 텍스트가 있는지
2. 해당 섹션 아래에 법령 원문이 있는지
3. `lib/ai-answer-processor.ts`의 `markLawQuotes()` 함수 동작 확인

---

## 📁 관련 파일

**수정된 파일**:
- `lib/file-search-client.ts` (Line 230-326: PROMPT_TEMPLATES)

**테스트 가이드**:
- `docs/RAG_PHASE_4-6_TEST_GUIDE.md`

**계획 문서**:
- `C:\Users\user\.claude\plans\twinkling-plotting-duck.md`

**관련 아키텍처**:
- `important-docs/RAG_ARCHITECTURE.md`
- `important-docs/JSON_TO_HTML_FLOW.md`

---

## 🚀 테스트 후 할 일

### 테스트 성공 시
1. 테스트 결과를 `task.md`에 기록
2. 다음 Phase (Phase 7-8) 검토 (선택사항)

### 테스트 실패 시
1. 실패한 쿼리 유형 기록
2. Console 에러 로그 캡처
3. AI 답변 스크린샷 캡처
4. Claude에게 공유하여 추가 수정

---

## 📚 배경 지식 (참고용)

### RAG Phase 4-6 요약

**Phase 4 (B4)**: 쿼리 전처리 파이프라인
- 법령명/조문 번호 추출 및 정규화
- 질문 유형 자동 분류 (specific/general/comparison/procedural)
- 띄어쓰기 정규화, 검색 노이즈 제거

**Phase 5 (B5)**: 질문 유형별 시스템 프롬프트
- 4가지 질문 유형별 맞춤형 프롬프트
- 기존 HTML 변환 로직과 완전 호환

**Phase 6 (C7)**: Metadata Filter 활용
- 법령 유형별 자동 필터링 (법률/시행령/시행규칙/조례)
- 특정 법령명 검색 시 해당 법령군만 검색

---

## ⏰ 예상 소요 시간

- 캐시 삭제: 1분
- 4가지 쿼리 테스트: 10분
- 검증 및 결과 기록: 5분

**총 예상 시간**: 15-20분

---

**문서 버전**: 1.0
**작성자**: Claude Code
**다음 업데이트**: 테스트 완료 후
