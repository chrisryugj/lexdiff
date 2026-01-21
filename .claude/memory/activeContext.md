# Active Context

**마지막 업데이트**: 2026-01-22 (클린 아키텍처 리팩토링 Phase 1-2-4 완료)

## 현재 상태

**클린 아키텍처 도입 완료** - Domain Layer + Facade Layer + Presentation Layer 완료.
- `unified-query-classifier.ts` 1,273줄 → 45줄 Facade + 20개 분리 모듈
- `search-bar.tsx` 725줄 → 11줄 Facade + 7개 분리 모듈

### 🏗️ 클린 아키텍처 리팩토링 (2026-01-22)

| Phase | 상태 | 내용 |
|-------|------|------|
| Phase 1: Domain Layer | ✅ 완료 | 20개 모듈 분리 (value-objects, entities, patterns, services) |
| Phase 2: Facade Layer | ✅ 완료 | `unified-query-classifier.ts` 1,273줄 → 45줄 |
| Phase 3: Application Layer | ⏸️ 보류 | UseCase 패턴 (선택적) |
| Phase 4: Presentation Layer | ✅ 완료 | `search-bar.tsx` 725줄 → 11줄 Facade + 7개 모듈 |

**SearchBar 모듈 구조** (`components/search-bar/`):
```
components/search-bar/
├── index.tsx                    # 187줄, 메인 오케스트레이터
├── SearchBarDropdown.tsx        # 183줄, 드롭다운 UI
├── SearchBarChoiceDialog.tsx    # 74줄, 모드 선택 다이얼로그
├── types.ts                     # 공유 타입
└── hooks/
    ├── useSearchBarState.ts     # 153줄, 상태 관리
    └── useSearchBarHandlers.ts  # 206줄, 핸들러 로직
```

**생성된 폴더 구조** (`src/domain/`):
```
src/domain/
├── search/
│   ├── value-objects/     # SearchType, LegalQueryType, Confidence 등
│   ├── entities/          # Classification
│   └── services/          # QueryClassifier, EntityExtractor 등
└── patterns/              # PrecedentPattern, OrdinancePattern 등
```

**핵심 서비스 파일**:
| 파일 | 역할 | 줄 수 |
|------|------|-------|
| `QueryClassifier.ts` | 메인 분류 로직 | 173 |
| `EntityExtractor.ts` | 법령명/조문 추출 | ~80 |
| `PatternDetector.ts` | 판례/재결례/해석례 패턴 | ~100 |
| `DomainDetector.ts` | 도메인 감지 | ~100 |
| `CompatibilityLayer.ts` | 하위 호환 함수 | ~120 |

### ✅ Critical 수정 완료

| 이슈 | 파일 | 상태 |
|------|------|------|
| `.env.local` 파일 쓰기 제거 | `api/admin/create-store/route.ts` | ✅ 완료 |
| XSS 취약점 수정 | `hooks/use-law-viewer-admin-rules.ts:170` | ✅ 완료 |
| XSS 취약점 수정 | `lib/content-click-handlers/precedent-handler.ts:137` | ✅ 완료 |
| ErrorBoundary 추가 | `app/layout.tsx` | ✅ 완료 |
| SSE 스트림 cleanup | 수정 불필요 (async iterator 자동 정리) | ✅ 확인 |

### 📊 코드 리뷰 결과 (2026-01-18)

- **전체 평가**: B+ (Critical 수정 후 배포 가능)
- any 타입: 100+ 회
- catch (error: any): 138개 파일 (4개 수정됨)
- 메모리 누수 위험: 4곳
- law-viewer.tsx useEffect: 5개 (12개에서 축소)

### ✅ 최근 완료된 작업

| 작업 | 상태 | 비고 |
|------|------|------|
| AI 답변 중복 버그 수정 | ✅ | file-search-client.ts 재시도 로직 비활성화 |
| 모바일 모달 스크롤 잘림 | ✅ | reference-modal.tsx overflow-x-hidden 적용 |
| `ignoreBuildErrors` 제거 | ✅ P0 | next.config.mjs에서 삭제 |
| 타입 에러 수정 | ✅ P0 | `file-x` → `file` 아이콘 수정 |
| `delegation-panel` 분리 | ✅ P1 | 1,652줄 → 541줄 + 4모듈 |
| `LegalMarkdownRenderer` 분리 | ✅ P2 | 877줄 → 7개 파일 |
| law-viewer.tsx useEffect 정리 | ✅ | 12개 → 5개 (17줄 감소) |
| framer-motion LazyMotion | ✅ | ~60% 번들 감소 |
| React.memo 적용 | ✅ | LawViewer, SearchResultView |
| catch (error: any) 개선 | ✅ | 주요 파일 4개 수정 |

### 📦 모듈화된 컴포넌트 구조

**delegation-panel** (`components/law-viewer-delegation-panel/`):
```
├── index.tsx              # 541줄, 메인
├── AdminRulesTab.tsx      # 행정규칙 탭
├── DelegationGroupCard.tsx # 그룹 카드
├── types.ts               # 타입 정의
└── utils.ts               # 헬퍼 함수
```

**LegalMarkdownRenderer** (`components/legal-markdown-renderer/`):
```
├── index.tsx              # 메인 렌더러
├── SimpleFlowchartRenderer.tsx
├── BlockquoteRenderer.tsx
├── LinkRenderer.tsx
├── TableRenderer.tsx
├── section-icons.ts
└── visited-laws.ts
```

**useSearchHandlers** (`components/search-result-view/hooks/useSearchHandlers/`):
```
├── index.ts               # 205줄, 오케스트레이터
├── types.ts               # 85줄, 공유 타입
├── useFetchLawContent.ts  # 201줄, 법령 본문 조회
├── useAiSearch.ts         # 270줄, AI 검색 (RAG)
├── useBasicSearch.ts      # 271줄, 구조화 검색
├── useBasicHandlers.ts    # 397줄, 기본 핸들러
└── useUnifiedSearch.ts    # 734줄, 통합검색 (판례/해석례)
```

**globals.css 분리** (`app/styles/`):
```
app/
├── globals.css            # 46줄 (1,263줄 → 46줄, 96% 감소)
└── styles/
    ├── fonts.css          # 66줄, @font-face
    ├── theme-variables.css # 178줄, :root/.dark/@theme
    ├── animations.css     # 538줄, @keyframes + animate-*
    ├── law-styles.css     # 298줄, 법령 링크/prose
    └── button-hover.css   # 115줄, 버튼 호버 효과
```

**law-viewer 분리** (`components/law-viewer/`):
```
├── index.ts                    # 7개 export
├── law-viewer-action-buttons.tsx
├── law-viewer-header.tsx       # 125줄 (신규)
├── law-viewer-main-content.tsx # 401줄 (신규)
├── law-viewer-ordinance-actions.tsx
├── law-viewer-related-cases.tsx
├── law-viewer-sidebar.tsx
└── law-viewer-single-article.tsx
```

### 📋 다음 할 일

**✅ 클린 아키텍처 Phase 1-2-4 완료**

- [x] **Phase 1**: Domain Layer 구축 (20개 모듈)
- [x] **Phase 2**: Facade Layer 구축 (1,273줄 → 45줄)
- [ ] **Phase 3**: Application Layer (UseCase) - 선택적
- [x] **Phase 4**: Presentation Layer (SearchBar 분리) - 725줄 → 11줄 + 7개 모듈

**배포 전 추가 점검 가능 항목**:
- [ ] 검색 UX 엣지 케이스 테스트
- [ ] AI vs 법령 분기 정확도 검증
- [ ] 검색 결과 없음 시 대안 제시 개선

**남은 대형 파일** (800줄 이상):
| 파일 | 줄 수 | 상태 |
|------|-------|------|
| `law-viewer.tsx` | 941 | ⚠️ 주의 |
| `file-search-client.ts` | ~800 | 현재 유지 |
| `unified-query-classifier.ts` | ~~1,273~~ → **45** | ✅ Facade로 교체 |
| `search-bar.tsx` | ~~725~~ → **11** | ✅ Facade로 교체 |

## 핵심 파일

| 파일 | 역할 | 줄 수 |
|------|------|-------|
| `lib/file-search-client.ts` | Gemini File Search 스트리밍 | ~800 |
| `components/search-result-view/index.tsx` | 검색 결과 메인 컴포넌트 | ~500 |
| `components/law-viewer.tsx` | 법령 뷰어 오케스트레이터 | 941 |
| `components/law-viewer-delegation-panel/` | 위임법령 패널 (모듈화됨) | 903 (5개 파일) |

### ❌ 기각된 Gemini 지적사항

| 지적 | 기각 이유 |
|------|-----------|
| Next.js App Router로 변경 | 의도적 설계. History API + IndexedDB로 검색 결과 영속화 |
| !important 제거 | 1,262줄 중 2-3%만 사용 |

## 주요 패턴

### Gemini SDK 타입 우회
```typescript
// SDK 버전 호환성 이슈로 any 사용
const store = await (genAI as any).fileSearchStores.create({...})
```

### Cheerio 타입 처리
```typescript
// Cheerio<Element> 대신 any 사용 (타입 추론 문제 회피)
let start: any = null
```

### useEffect cleanup 래핑
```typescript
// subscribe가 boolean 반환할 때
return () => { unsubscribe() }
```

### Icon 이름 타입 좁히기
```typescript
// as const로 리터럴 타입 유지
icon: "search" as const
```

### react-markdown 새 버전 대응
```typescript
// inline prop 제거됨, className으로 판단
code: ({ node, className, children, ...props }: any) => {
  if (!className) { /* inline */ }
}
```
