# CLAUDE.md - LexDiff

## What This Is
한국 법령 비교 + AI 검색 시스템 (법제처 API + FC-RAG)

## 🔴 LLM 구성 (중요)
| 역할 | LLM | 경로 |
|------|-----|------|
| **Primary** | **Sonnet 4.6 (Claude)** | route.ts → engine.ts `executeClaudeRAGStream()` → Anthropic SDK |
| Fallback | Gemini Flash | route.ts → engine.ts `executeGeminiRAGStream()` (Claude 불능 시) |

- **인증**: OpenClaw `auth-profiles.json`에서 Anthropic OAuth 토큰 동적 읽기 (`lib/fc-rag/anthropic-client.ts`)
- tool-adapter, tool-tiers, prompts, fast-path는 **양쪽 LLM이 공유**하는 인프라
- 도구 description·프롬프트 최적화는 **Claude 기준 우선** 설계
- engine.ts의 GoogleGenAI 호출은 **폴백 전용**
- Bridge/Nanobot 의존성 제거됨 (2026-03-18)

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
| `law-viewer.tsx` | **메인** 법령/판례 뷰어 (오케스트레이터) |

### law-viewer 하위 컴포넌트 (`components/law-viewer/`)
| 컴포넌트 | 역할 |
|----------|------|
| `law-viewer-action-buttons.tsx` | 액션 버튼 (비교/요약/위임법령/판례) |
| `law-viewer-sidebar.tsx` | 좌측 사이드바 (조문 목록/AI 관련 법령) |
| `law-viewer-single-article.tsx` | 단문 조회 본문 (헤더+본문+이력+판례) |
| `law-viewer-related-cases.tsx` | 판례 관련 심급 목록 |
| `law-viewer-ordinance-actions.tsx` | 조례 전용 액션 버튼 |

### law-viewer 관련 훅 (`hooks/`)
| 훅 | 역할 |
|----|------|
| `use-law-viewer-modals.ts` | 외부 법령/별표 모달 관리 |
| `use-law-viewer-three-tier.ts` | 위임법령 데이터 |
| `use-law-viewer-admin-rules.ts` | 행정규칙 데이터 |
| `use-law-viewer-precedents.ts` | 관련 판례 데이터 |
| `use-related-precedent-cases.ts` | 판례 관련 심급 검색 |

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
