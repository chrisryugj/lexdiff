# CLAUDE.md - LexDiff

## What This Is
한국 법령 비교 + AI 검색 시스템 (법제처 API + Gemini RAG)

## Commands
```bash
npm run dev      # 개발 서버
npm run build    # 빌드
npm run lint     # 린트
```

## 🔴 컴포넌트 구조 (자주 혼동되는 부분)

### 판례 (Precedent) 관련
| 컴포넌트 | 역할 | 파일 |
|----------|------|------|
| `PrecedentResultList` | 검색 결과 리스트 화면 | search-result-view/PrecedentResultList.tsx |
| `PrecedentSection` | 법령 뷰어 하단 관련 판례 미니 목록 | precedent-section.tsx |
| `PrecedentDetailPanel` | 판례 상세 **사이드 패널** (판시사항/요지/전문) | precedent-section.tsx |
| LawViewer + `isPrecedent=true` | **판례 전문뷰** 모드 | law-viewer.tsx |

**흐름**: 검색 → PrecedentResultList → 클릭 → LawViewer(isPrecedent=true) → 하단에 PrecedentSection

### 모달 vs 뷰어
| 컴포넌트 | 용도 |
|----------|------|
| `reference-modal.tsx` | 참조 법령 팝업 (히스토리 스택) |
| `comparison-modal.tsx` | 법령 비교 팝업 (히스토리 스택) |
| `law-viewer.tsx` | **메인** 법령/판례 뷰어 |

## 🔴 핵심 규칙

1. **링크 생성**: `lib/unified-link-generator.ts` (직접 regex 금지)
2. **JO 코드**: `"제38조"` → `"003800"` (`lib/law-parser.ts`)
3. **SSE 버퍼**: 루프 후 잔여 처리 필수
4. **모바일 onClick**: async 금지 → `.then().catch()`

## Tech Stack
Next.js 16, React 19, TypeScript 5, Tailwind v4, shadcn/ui, Gemini 2.5 Flash

## 상세 문서
| 문서 | 내용 |
|------|------|
| [09-COMPONENT_ARCHITECTURE](important-docs/09-COMPONENT_ARCHITECTURE.md) | 컴포넌트 구조, 데이터 흐름 |
| [07-LEGAL_DATA_API_GUIDE](important-docs/07-LEGAL_DATA_API_GUIDE.md) | 판례/해석례 API |
| [05-RAG_ARCHITECTURE](important-docs/05-RAG_ARCHITECTURE.md) | SSE, Gemini 연동 |
| [03-JSON_TO_HTML_FLOW](important-docs/03-JSON_TO_HTML_FLOW.md) | 법령 뷰어 렌더링 |
