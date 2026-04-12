# 컴포넌트 아키텍처

## 1. 판례 (Precedent) 컴포넌트

### 파일별 역할
| 파일 | 컴포넌트 | 역할 |
|------|----------|------|
| `precedent-section.tsx` | `PrecedentSection` | 법령 뷰어 하단 미니 목록 (bottom 모드) |
| `precedent-section.tsx` | `PrecedentDetailPanel` | 사이드 패널 상세 (side 모드) |
| `search-result-view/PrecedentResultList.tsx` | `PrecedentResultList` | 검색 결과 화면 |
| `search-result-view/PrecedentResultList.tsx` | `PrecedentResultCard` | 개별 카드 |
| `law-viewer.tsx` | LawViewer (isPrecedent=true) | 판례 전문뷰 |

### 데이터 흐름
```
[검색] → handlePrecedentSearch → PrecedentResultList
         ↓ onSelect
         handlePrecedentSelect → LawViewer(isPrecedent=true)
         ↓
         useLawViewerPrecedents → PrecedentSection/DetailPanel
```

### 뷰 모드
- **bottom**: 하단 미니 목록 (PrecedentSection)
- **side**: 우측 상세 패널 (PrecedentDetailPanel)

---

## 2. 모달 시스템

### 히스토리 스택
- `reference-modal.tsx`, `comparison-modal.tsx`
- `modalHistory` 배열로 뒤로가기 지원
- 모달 내 법령 링크 클릭 → 스택에 push

### 모달 vs 뷰어
- **모달**: 팝업, 오버레이 (ReferenceModal, ComparisonModal)
- **뷰어**: 메인 콘텐츠 영역 (LawViewer)

---

## 3. 검색 결과 시스템

| 컴포넌트 | 역할 | 파일 |
|----------|------|------|
| `SearchResultView` | 검색 결과 전체 컨테이너 | search-result-view/index.tsx |
| `SearchResultList` | 법령 검색 결과 | search-result-view/SearchResultList.tsx |
| `PrecedentResultList` | 판례 검색 결과 | search-result-view/PrecedentResultList.tsx |

---

## 4. law-viewer 구조

### 메인 컴포넌트
`law-viewer.tsx` - 오케스트레이터 (1,189줄)

### 하위 컴포넌트 (`components/law-viewer/`)
| 파일 | 역할 |
|------|------|
| `law-viewer-action-buttons.tsx` | 액션 버튼 (비교/요약/위임법령/판례) |
| `law-viewer-sidebar.tsx` | 좌측 사이드바 (조문 목록/AI 관련 법령) |
| `law-viewer-single-article.tsx` | 단문 조회 본문 (헤더+본문+이력+판례) |
| `law-viewer-related-cases.tsx` | 판례 관련 심급 목록 |
| `law-viewer-ordinance-actions.tsx` | 조례 전용 액션 버튼 |

### 관련 훅 (`hooks/`)
| 훅 | 역할 |
|----|------|
| `use-law-viewer-modals.ts` | 외부 법령/별표 모달 관리 |
| `use-law-viewer-three-tier.ts` | 위임법령 데이터 |
| `use-law-viewer-admin-rules.ts` | 행정규칙 데이터 |
| `use-law-viewer-precedents.ts` | 관련 판례 데이터 |
| `use-related-precedent-cases.ts` | 판례 관련 심급 검색 |

---

## 5. AI 검색 시스템

### 검색 핸들러 (`search-result-view/hooks/useSearchHandlers/`)
| 파일 | 역할 |
|------|------|
| `useAiSearch.ts` | AI 검색 SSE 소비 핵심 훅 (fetch → stream → 이벤트 처리) |
| `index.ts` | 검색 핸들러 오케스트레이터 (AI vs 기본 분류) |
| `useBasicSearch.ts` | 법령 키워드 검색 |
| `useUnifiedSearch.ts` | 판례/해석례/조세심판 통합 검색 |
| `useFetchLawContent.ts` | 법령 본문 fetch |

### AI 답변 표시
| 파일 | 역할 |
|------|------|
| `law-viewer-ai-answer.tsx` | AI 답변 Markdown 렌더링 + 인용 링크 |
| `law-viewer/article-suggestions.tsx` | "AI에게 물어보기" 추천 질의 칩 + 커스텀 입력 |
| `ai-search-loading/index.tsx` | 로딩 상태 (단계별 진행, 타임라인) |
| `law-viewer/law-viewer-main-content.tsx` | AI 답변 + 관련 콘텐츠 메인 뷰 |

### 데이터 흐름
```
검색 입력 → handleSearchInternal (쿼리 분류)
  ├─ AI 모드 → handleAiSearch → fetch('/api/fc-rag', {query, preEvidence})
  │              ↓ SSE 이벤트 루프
  │              status → addToolCallLog
  │              tool_call/tool_result → 타임라인 표시
  │              answer_token → 실시간 답변 누적 (Claude CLI 로컬 + Bridge)
  │              answer → 최종 답변 + 인용
  │              citation_verification → 검증 배지
  │              source → Claude/Gemini 표시
  │              ↓
  │              LawViewer (aiAnswerMode=true) → AIAnswerContent
  │
  └─ 기본 모드 → handleBasicSearch → 법령/판례 검색
```

### preEvidence 즉답 흐름
```
LawViewerSingleArticle → ArticleSuggestions
  ↓ 칩 클릭 또는 커스텀 질의
onAiQuery(query, preEvidence="「법령명」 제N조 조문내용...")
  ↓
fetch('/api/fc-rag', { query, preEvidence })
  ↓ Claude: 도구 호출 없이 preEvidence만으로 즉답 (0 tool calls)
answer 이벤트 → 빠른 응답
```

---

## 6. Key Files (빠른 참조)

### 핵심
| 파일 | 역할 |
|------|------|
| `lib/unified-link-generator.ts` | 법령 링크 생성 (유일 진입점) |
| `lib/law-parser.ts` | JO 코드 변환 |
| `lib/precedent-parser.ts` | 판례 XML/JSON 파싱 |

### UI
| 파일 | 역할 |
|------|------|
| `law-viewer.tsx` | 메인 법령/판례 뷰어 (오케스트레이터) |
| `components/law-viewer/` | law-viewer 하위 컴포넌트 |
| `precedent-section.tsx` | 관련 판례 섹션 |
| `reference-modal.tsx` | 참조 모달 |

### API
| 파일 | 역할 |
|------|------|
| `app/api/precedent-search/` | 판례 검색 |
| `app/api/precedent-detail/` | 판례 상세 |
| `app/api/fc-rag/` | AI FC-RAG (SSE 스트리밍) |

---

## 7. 환경변수

| 변수 | 용도 |
|------|------|
| `LAW_OC` | 법제처 API 인증키 (korean-law-mcp) |
| `GEMINI_API_KEY` | Gemini AI (폴백) |
| `HERMES_API_URL` | Hermes Gateway URL (기본 `http://127.0.0.1:8642`, Vercel은 CF Worker URL) |
| `HERMES_API_KEY` | Hermes 게이트웨이 인증 키 |

---

## 8. API 응답 형식

| API | 형식 | 파싱 |
|-----|------|------|
| `/api/law-search` | XML | DOMParser |
| `/api/eflaw` | JSON | `json?.법령` 직접 접근 |
| `/api/precedent-*` | JSON | 표준 JSON |

---

## 9. State Management

- **Singleton**: `favorites-store.ts`, `debug-logger.ts`, `error-report-store.ts`
- **IndexedDB**: `law-content-cache.ts` (7일), `admin-rule-cache.ts` (영구)

---

**버전**: 2.0 | **업데이트**: 2026-03-21
