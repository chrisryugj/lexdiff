# LexDiff 문서 폴더

## 📁 폴더 구조

### `/docs` (현재 폴더)
**현재 개발에 필요한 참고 문서**

- `GEMINI_FILE_SEARCH_GUIDE.md` - Google File Search API 가이드 (현재 사용 중)
- `API_INTEGRATION.md` - 외부 API 연동 가이드
- `CODE_EXAMPLES.md` - 코드 예제 모음
- `DATABASE_SCHEMA.md` - Turso DB 스키마 정의
- `DEPLOYMENT_GUIDE.md` - 배포 가이드
- `START_PROMPT.md` - 프로젝트 시작 프롬프트

### `/docs/archived`
**구현 완료된 문서 (참고용)**

- **Phase 완료 문서**: PHASE1, PHASE2-4, PHASE5, PHASE6 구현 가이드
- **버그 수정 문서**: 긴급 수정, Phase 7 수정, 검색 시스템 수정
- **구현 완료 기능**: 3단 비교, 조례/규칙 파싱, File Search 구현 등

### `/docs/future`
**미래 참고 문서 (구현되지 않음)**

- 학습 시스템 개선 계획
- 성능 최적화 계획
- Phase 9 계획 (Pro/Small RAG)
- 향후 로드맵

## 🎯 현재 주요 기술

### AI 검색 시스템
- **Google File Search RAG** (Gemini 2.0 Flash)
  - 자연어 질문으로 법령 검색
  - 실시간 SSE 스트리밍 답변
  - 인용 출처 자동 링크

### 검색 시스템
- **Phase 7**: IndexedDB 쿼리 캐시 (7일, ~25ms)
- **기본 검색**: 레벤슈타인 거리 유사도 매칭 (85%/60% 적응형)

### 비활성화된 시스템
- ~~Phase 5: Intelligent Search~~ (학습 데이터 오염으로 비활성화)
- ~~Phase 6: Vector Search~~ (Phase 5와 함께 비활성화)

## 📚 주요 문서 가이드

### 처음 시작하는 경우
1. 프로젝트 루트의 `README.md` - 프로젝트 개요
2. 프로젝트 루트의 `CLAUDE.md` - 개발 가이드
3. `GEMINI_FILE_SEARCH_GUIDE.md` - AI 검색 시스템 구현 방법

### API 연동이 필요한 경우
- `API_INTEGRATION.md` - law.go.kr, Gemini API 연동

### 배포가 필요한 경우
- `DEPLOYMENT_GUIDE.md` - Vercel 배포 가이드

### 코드 참고가 필요한 경우
- `CODE_EXAMPLES.md` - 주요 패턴 및 예제

## 🗂️ 문서 관리 원칙

### archived로 이동하는 문서
- 구현이 완료된 Phase 문서
- 해결된 버그 수정 문서
- 완료된 기능 구현 계획

### future로 이동하는 문서
- 현재 방향과 다른 기술 문서 (예: Voyage AI 임베딩)
- 미래 구현 예정 기능
- 아이디어 및 개선 계획

### docs 루트에 유지하는 문서
- 현재 사용 중인 기술 가이드
- 현재 참고가 필요한 문서
- 개발/배포에 필수적인 문서

## 📅 최근 업데이트

### 2025-11-15
- docs 폴더 구조 정리 완료
- Voyage AI 임베딩 관련 문서 삭제 (현재 방향과 상이)
- Phase 완료 문서 archived로 이동
- README.md 현재 구조 반영

## 🔗 관련 문서

- `/README.md` - 프로젝트 메인 README
- `/CLAUDE.md` - Claude Code용 개발 가이드
