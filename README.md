# 신·구법 법령 비교 시스템

검색어만 입력하면 현행 조문 원문과 신·구법 대조를 한 화면에서 확인하고, AI 요약과 즐겨찾기 추적까지 가능한 전문가용 법령 분석 도구입니다.

## 주요 기능

### 1. 법령 검색 및 조회
- 자유 텍스트 검색 (예: "관세법 38조", "관세법 제10조의2")
- 자동 조문 번호 정규화 및 JO 코드 변환
- 지방자치법규(조례/규칙) 검색 지원
- 최근 검색 기록 자동 저장

### 2. 현행 법령 뷰어
- 조문별 네비게이션 트리
- 원문 그대로 표시
- 변경된 조문 시각적 강조
- 조·항·호 구조화된 표시
- 개정 이력 마커 스타일링 (`<개정>`, `[본조신설]`, `[종전~]`)

### 3. 3단 비교 시스템 (법률-시행령-시행규칙)
- **1단 뷰**: 법률 본문만 표시
- **2단 뷰**: 법률 + 시행령 좌우 비교
- **3단 뷰**: 법률 + 시행령 + 시행규칙 3열 비교
- 각 단별 독립 스크롤
- 자동 뷰 모드 전환 (데이터 유무에 따라)

### 4. 행정규칙 조회
- 조문별 관련 행정규칙 자동 검색
- 제목/내용 기반 매칭
- IndexedDB 영구 캐싱 (빠른 재로딩)
- HTTP 브라우저 캐싱 (24시간)
- 병렬 API 호출로 성능 최적화
- 목적조항 즉시 표시

### 5. 신·구법 대조
- 좌우 2열 비교 뷰
- 변경 사항 하이라이팅 (추가/삭제/수정)
- 동기화된 스크롤
- 메타데이터 표시 (시행일, 공포일/번호, 제개정구분)

### 6. AI 변경 요약
- Google Gemini 2.5 Flash 기반 자동 요약
- 핵심 변경점 3-5개 불릿 포인트
- 용어 변경 vs 실질 내용 변경 구분
- 요약 복사 기능

### 7. 즐겨찾기 & 변경 추적
- 조문별 즐겨찾기 저장
- 로컬 스토리지 기반 영구 저장
- 변경 감지 알림 (향후 구현)

## 기술 스택

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI**: Tailwind CSS v4, shadcn/ui, Radix UI
- **AI**: Google Gemini 2.5 Flash (`@google/genai`)
- **API**: 법제처 법령 API (law.go.kr)
- **State**: React Hooks, localStorage, IndexedDB
- **Caching**: HTTP Browser Cache, IndexedDB (persistent)

## 설치 및 실행

1. 환경 변수 설정:
\`\`\`bash
cp .env.local.example .env.local
\`\`\`

2. `.env.local` 파일에 법제처 API 키 입력:
\`\`\`
LAW_OC=your_api_key_here
\`\`\`

3. 개발 서버 실행:
\`\`\`bash
npm run dev
\`\`\`

4. 브라우저에서 `http://localhost:3000` 접속

## 환경 변수

- `LAW_OC`: 법제처 법령 API 인증키 (필수)
- `GEMINI_API_KEY`: Google Gemini API 키 (AI 요약 기능에 필수)

## 디버그 콘솔

화면 하단의 디버그 콘솔(기본 축소)에서 모든 API 호출, 파싱 과정, 오류를 실시간으로 확인 가능합니다.

## 프로젝트 구조

\`\`\`
├── app/
│   ├── api/
│   │   ├── eflaw/route.ts           # 현행법령 API
│   │   ├── oldnew/route.ts          # 신·구법 대조 API
│   │   ├── three-tier/route.ts      # 3단비교 API (위임조문)
│   │   ├── hierarchy/route.ts       # 법령 체계도 API
│   │   ├── admrul/route.ts          # 행정규칙 본문 API
│   │   ├── law-search/route.ts      # 법령 검색 API
│   │   ├── ordin-search/route.ts    # 지방법규 검색 API
│   │   └── summarize/route.ts       # AI 요약 API (Gemini)
│   └── page.tsx                     # 메인 페이지
├── components/
│   ├── search-bar.tsx               # 검색 바
│   ├── law-viewer.tsx               # 법령 뷰어 (3단 비교 포함)
│   ├── comparison-modal.tsx         # 신·구법 비교 모달
│   ├── ai-summary-dialog.tsx        # AI 요약 다이얼로그
│   ├── favorites-panel.tsx          # 즐겨찾기 패널
│   ├── admin-rules-section.tsx      # 행정규칙 섹션
│   └── debug-console.tsx            # 디버그 콘솔
├── lib/
│   ├── law-types.ts                 # 타입 정의
│   ├── law-parser.ts                # JO 코드 파서
│   ├── law-xml-parser.tsx           # 현행법령 XML 파서
│   ├── three-tier-parser.ts         # 3단비교 JSON 파서
│   ├── hierarchy-parser.ts          # 법령 체계도 XML 파서
│   ├── admrul-parser.ts             # 행정규칙 XML 파서
│   ├── use-admin-rules.ts           # 행정규칙 조회 Hook
│   ├── admin-rule-cache.ts          # IndexedDB 캐시 관리
│   ├── favorites-store.ts           # 즐겨찾기 스토어
│   └── debug-logger.ts              # 디버그 로거
\`\`\`

## 라이선스

MIT
 
## 로컬 실행 가이드

- Node.js 20 이상을 권장합니다.
- 환경 파일 복사: Windows(PowerShell) `Copy-Item .env.local.example .env.local`, macOS/Linux `cp .env.local.example .env.local`
- `.env.local` 값 채우기:
  - `LAW_OC`: law.go.kr DRF OC 값(필수)
  - `GEMINI_API_KEY`: Google Gemini API Key(필수)
- 패키지 설치: `pnpm install` 또는 `npm install`
- 개발 서버 실행: `pnpm dev` 또는 `npm run dev`
- 접속: `http://localhost:3000`
