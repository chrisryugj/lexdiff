# LexDiff 문서 폴더

## 📁 문서 목록

| # | 파일명 | 설명 |
|---|--------|------|
| 01 | ANALYSIS_REPORT | RAG 시스템 종합 분석 |
| 02 | GEMINI_FILE_SEARCH_GUIDE | Google File Search API 가이드 |
| 03 | NEXT_STEPS | 다음 작업 계획 |
| 04 | REFACTORING_PLAN | 대형 파일 리팩토링 계획 |
| 05 | LAW_VIEWER_ARCHITECTURE | law-viewer.tsx 아키텍처 |
| 06 | PROJECT_ARCHITECTURE | 전체 프로젝트 아키텍처 |
| 07 | CITATION_VERIFICATION | 인용 검증 시스템 |
| 08 | DELETED_CODE_ARCHIVE | 삭제 코드 아카이브 |
| 09 | METADATA_SYSTEM | 메타데이터 시스템 |
| 10 | ORDINANCE_RAG_REPORT | 조례 RAG 보고서 |
| 11 | PRECEDENT_SEARCH_GUIDE | 판례 검색 구현 가이드 |
| 12 | OPTIMIZATION_PLAN | 최적화 실행 계획 |
| 13 | RAG_TEST_GUIDE | RAG Phase 4-6 테스트 |
| 14 | SKILLS_GUIDE | Superpowers 스킬 가이드 |
| 15 | UI_UX_ANALYSIS | UI/UX 분석 보고서 |
| 16 | AGENTIC_RAG_PLAN | Agentic RAG 구현 계획 |
| 17 | LEGAL-AI-GRAPHRAG-PRD | Neo4j GraphRAG 기반 법령 AI 고도화 PRD |

### `/docs/future`
**미래 계획 문서**
- 향후 로드맵
- RAG 품질 개선 계획

## 🎯 현재 주요 기술

### AI 검색 시스템
- **Google File Search RAG** (Gemini 2.5 Flash)
  - 자연어 질문으로 법령 검색
  - 실시간 SSE 스트리밍 답변
  - 2-Tier AI 라우팅 (법률 질문 vs 일반 질문)
  - 4단계 로딩 UX (타이핑 효과)
  - 인용 출처 자동 링크

### 법률 데이터 API (NEW)
- **판례 검색**: 대법원/하급심 판례
- **해석례 검색**: 법령해석 사례
- **조세심판원**: 재결례 검색
- **관세청**: 법령해석 검색
- **통합 검색**: 법령+행정규칙+자치법규 병렬

### 검색 시스템
- **IndexedDB 캐시**: 7일, ~25ms
- **기본 검색**: 레벤슈타인 거리 유사도 매칭

## 📚 주요 문서 가이드

| 목적 | 문서 |
|------|------|
| 처음 시작 | `CLAUDE.md`, `02-GEMINI_FILE_SEARCH_GUIDE` |
| AI 검색 | `02-GEMINI_FILE_SEARCH_GUIDE`, `16-AGENTIC_RAG_PLAN`, `17-LEGAL-AI-GRAPHRAG-PRD` |
| 아키텍처 | `05-LAW_VIEWER_ARCHITECTURE`, `06-PROJECT_ARCHITECTURE` |
| UI/UX | `15-UI_UX_ANALYSIS` |

## 📅 최근 업데이트

### 2026-03-08
- 17-LEGAL-AI-GRAPHRAG-PRD 추가 (Mini PC + Neo4j + 법령DB 자동화 + Stream 챗봇 계획)

### 2025-12-20
- 판례/해석례/재결례 검색 API 9개 추가 (korean-law-mcp 도입)
- 2-Tier AI 라우팅 시스템
- hugeicons 아이콘 시스템 마이그레이션

### 2025-12-16
- docs 폴더 번호 재정리 (01-16)
- archived 폴더 삭제 (오래된 Phase 문서)
- 파일명 간소화

## 🔗 관련 문서

- `/README.md` - 프로젝트 개요
- `/CLAUDE.md` - 개발 가이드
- `/important-docs/` - 핵심 참조 문서
