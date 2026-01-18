# Active Context

**마지막 업데이트**: 2026-01-18 (성능 최적화 완료)

## 현재 상태

배포 전 최종 코드 리뷰 + 성능 최적화 완료.

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

### 📋 다음 할 일 (선택적)

- [ ] `useSearchHandlers.ts` 분리 검토 (1,954줄) - 🔴 가장 큰 파일
- [ ] `globals.css` 분리 (1,262줄) - ⚪ P3 낮은 우선순위

## 핵심 파일

| 파일 | 역할 | 줄 수 |
|------|------|-------|
| `lib/file-search-client.ts` | Gemini File Search 스트리밍 | ~800 |
| `components/search-result-view/index.tsx` | 검색 결과 메인 컴포넌트 | ~500 |
| `components/law-viewer.tsx` | 법령 뷰어 오케스트레이터 | ~1,200 |
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
