# 법률 데이터 API 가이드

법제처 Open API 기반 판례/해석례/재결례 검색 시스템 사용 설명서

---

## 📚 목차

1. [개요](#개요)
2. [API 엔드포인트](#api-엔드포인트)
3. [판례 검색 시스템](#판례-검색-시스템)
4. [해석례 검색](#해석례-검색)
5. [통합 검색](#통합-검색)
6. [조세심판원 재결례](#조세심판원-재결례)
7. [관세청 법령해석](#관세청-법령해석)
8. [law-viewer 판례 연동](#law-viewer-판례-연동)

---

## 개요

korean-law-mcp 프로젝트에서 도입한 법제처 Open API 연동 기능:

| 기능 | target | 설명 |
|------|--------|------|
| 판례 검색 | `prec` | 대법원/하급심 판례 |
| 해석례 검색 | `expc` | 법령해석 사례 |
| 조세심판원 | `ttSpecialDecc` | 조세심판원 재결례 |
| 관세청 | `kcsCgmExpc` | 관세청 법령해석 |
| 통합 검색 | `law`, `admrul`, `ordin` | 법령+행정규칙+자치법규 병렬 |

---

## API 엔드포인트

### 검색 API (GET)

| 엔드포인트 | 파라미터 | 응답 |
|------------|----------|------|
| `/api/precedent-search` | `query`, `display?`, `page?`, `court?`, `sort?` | `{ totalCount, precedents[] }` |
| `/api/interpretation-search` | `query`, `display?`, `page?` | `{ totalCount, interpretations[] }` |
| `/api/search-all` | `query`, `maxResults?` | `{ laws, adminRules, ordinances }` |
| `/api/tax-tribunal-search` | `query`, `display?`, `page?`, `cls?`, `dpaYd?`, `rslYd?` | `{ totalCount, decisions[] }` |
| `/api/customs-search` | `query`, `display?`, `page?`, `explYd?` | `{ totalCount, interpretations[] }` |

### 전문 조회 API (GET)

| 엔드포인트 | 파라미터 | 응답 |
|------------|----------|------|
| `/api/precedent-text` | `id` (판례일련번호) | `PrecedentDetail` |
| `/api/interpretation-text` | `id` (법령해석일련번호) | `InterpretationDetail` |
| `/api/tax-tribunal-text` | `id` (특별행정심판재결례일련번호) | `TaxTribunalDetail` |
| `/api/customs-text` | `id` (법령해석일련번호) | `CustomsDetail` |

---

## 판례 검색 시스템

### API 스펙

```typescript
// 검색 요청
GET /api/precedent-search?query=관세법&display=10&page=1

// 응답
{
  totalCount: 416,
  precedents: [
    {
      id: "123456",           // 판례일련번호
      name: "2020다12345",    // 사건명
      caseNumber: "2020다12345", // 사건번호
      court: "대법원",         // 법원명
      date: "2020-03-15",     // 선고일자
      type: "판결",           // 판결유형
      link: "..."             // 상세링크
    }
  ],
  page: 1,
  display: 10
}
```

### 전문 조회

```typescript
// 요청
GET /api/precedent-text?id=123456

// 응답
{
  name: "2020다12345",
  caseNumber: "2020다12345",
  court: "대법원",
  date: "2020-03-15",
  caseType: "민사",
  judgmentType: "판결",
  holdings: "판시사항...",     // 판시사항
  summary: "판결요지...",      // 판결요지
  refStatutes: "관세법 제38조", // 참조조문
  refPrecedents: "...",        // 참조판례
  fullText: "..."              // 전문
}
```

### 파일 구조

| 파일 | 역할 |
|------|------|
| `app/api/precedent-search/route.ts` | 검색 API |
| `app/api/precedent-text/route.ts` | 전문 조회 API |
| `lib/precedent-parser.ts` | XML/JSON 파서, 타입 정의 |
| `lib/precedent-cache.ts` | IndexedDB 캐시 (TTL 7일) |
| `hooks/use-precedents.ts` | 데이터 훅 |
| `hooks/use-law-viewer-precedents.ts` | law-viewer 통합 훅 |
| `components/precedent-section.tsx` | UI 컴포넌트 |

---

## 해석례 검색

### API 스펙

```typescript
// 검색
GET /api/interpretation-search?query=세금

// 응답
{
  totalCount: 10,
  interpretations: [
    {
      id: "123456",
      name: "안건명",
      queryAgency: "질의기관명",
      replyAgency: "해석기관명",
      date: "2020-01-01",
      link: "..."
    }
  ]
}

// 전문 조회
GET /api/interpretation-text?id=123456
```

---

## 통합 검색

법령 + 행정규칙 + 자치법규를 **병렬로 검색**하여 한 번에 반환

### API 스펙

```typescript
// 요청
GET /api/search-all?query=관세&maxResults=10

// 응답
{
  query: "관세",
  laws: {
    totalCount: 13,
    results: [
      { id: "...", name: "관세법", type: "법령", date: "20240101", link: "..." }
    ]
  },
  adminRules: {
    totalCount: 12,
    results: [
      { id: "...", name: "관세법 사무처리에 관한 고시", type: "고시", date: "...", link: "..." }
    ]
  },
  ordinances: {
    totalCount: 0,
    results: []
  }
}
```

### 사용 사례

- 검색어 입력 시 여러 카테고리 결과를 한 화면에 표시
- 각 카테고리별로 `[더 보기]` 버튼으로 상세 페이지 이동

---

## 조세심판원 재결례

### API 스펙

```typescript
// 검색
GET /api/tax-tribunal-search?query=부가가치세

// 응답
{
  totalCount: 6322,
  decisions: [
    {
      id: "...",
      name: "사건명",
      claimNumber: "청구번호",
      decisionDate: "의결일자",
      dispositionDate: "처분일자",
      tribunal: "조세심판원",
      decisionType: "인용/기각",
      link: "..."
    }
  ]
}

// 전문 조회
GET /api/tax-tribunal-text?id=...
```

### 필터 파라미터

| 파라미터 | 설명 |
|----------|------|
| `cls` | 세목 분류 |
| `dpaYd` | 처분일자 (YYYYMMDD) |
| `rslYd` | 재결일자 (YYYYMMDD) |
| `sort` | 정렬 (날짜순 등) |

---

## 관세청 법령해석

### API 스펙

```typescript
// 검색
GET /api/customs-search?query=세금

// 응답
{
  totalCount: 35,
  interpretations: [
    {
      id: "...",
      name: "안건명",
      queryAgency: "질의기관명",
      replyAgency: "관세청",
      date: "2020-01-01",
      link: "..."
    }
  ]
}

// 전문 조회
GET /api/customs-text?id=...

// 응답
{
  name: "안건명",
  id: "...",
  date: "2020-01-01",
  queryAgency: "질의기관",
  replyAgency: "관세청",
  question: "질의요지...",
  answer: "회답...",
  reason: "이유..."
}
```

---

## law-viewer 판례 연동

### 동작 방식

1. 사용자가 법령 조문 선택
2. `useLawViewerPrecedents` 훅이 법령명+조문으로 판례 자동 검색
3. 조문 하단에 `PrecedentSection` 컴포넌트로 관련 판례 표시

### 코드 위치

```typescript
// components/law-viewer.tsx
import { useLawViewerPrecedents } from "@/hooks/use-law-viewer-precedents"
import { PrecedentSection } from "@/components/precedent-section"

// 훅 사용
const {
  precedents,
  selectedPrecedent,
  precedentDetail,
  isLoading,
  isLoadingDetail,
  error,
  fetchPrecedents,
  selectPrecedent,
  clearSelection,
} = useLawViewerPrecedents(lawName)
```

### UI 모드

**모드 1: 하단 미니 목록** (기본)
- 조문 내용 아래에 관련 판례 5건 표시
- 클릭 시 상세 정보 확장

**모드 2: 사이드 패널** (확장 클릭 시)
- 좌: 조문 내용 / 우: 판례 상세
- ResizablePanel로 너비 조절 가능

---

## 캐싱 전략

### IndexedDB 캐시

```typescript
// lib/precedent-cache.ts

// 캐시 저장
await cachePrecedentSearch(query, results)
await cachePrecedentDetail(id, detail)

// 캐시 조회 (TTL: 7일)
const cached = await getCachedPrecedentSearch(query)
const detail = await getCachedPrecedentDetail(id)

// 캐시 삭제
await clearPrecedentCache()
```

---

## 에러 처리

모든 API는 일관된 에러 응답 형식:

```typescript
// 400 Bad Request
{ error: "id 파라미터가 필요합니다" }

// 404 Not Found
{ error: "판례를 찾을 수 없습니다" }

// 500 Internal Server Error
{ error: "판례 검색 중 오류 발생" }
```

---

## 참고: 법제처 API target 코드

| target | 설명 |
|--------|------|
| `law` | 법령 |
| `admrul` | 행정규칙 |
| `ordin` | 자치법규 |
| `prec` | 판례 |
| `expc` | 법령해석례 |
| `ttSpecialDecc` | 조세심판원 특별행정심판 재결례 |
| `kcsCgmExpc` | 관세청 법령해석 |

---

**버전**: 1.0 | **작성일**: 2025-12-20
