# 법령 검색 성능 개선 계획

## 🐛 현재 문제

### 문제 1: 이중 캐시 구조로 인한 비효율

**현재 아키텍처**:
```
검색어 입력
  ↓
L0~L4 캐시 (Turso DB)
  ├─ HIT: lawId만 반환 (빠름, ~10ms)
  │   ↓
  │   IndexedDB 체크
  │   ├─ HIT: 법령 전문 반환 (매우 빠름, ~25ms) ✅
  │   └─ MISS: eflaw API 호출 (매우 느림, ~2000ms) ❌
  │
  └─ MISS: L4 API 호출 → 학습 (느림, ~2000ms)
```

**문제점**:
1. **L0~L4 캐시**: `lawId`만 저장, 법령 전문 없음
2. **IndexedDB 캐시**: 법령 전문 저장, 하지만 **별도 시스템**
3. **결과**: L1 HIT해도 IndexedDB MISS면 여전히 API 호출!

### 문제 2: 테스트 결과 오해

```
✅ 검색 성공 (2114ms)
   법령명: undefined    ← 문제!
   법령 ID: undefined   ← 문제!
```

- `intelligentSearch()`가 `lawId`만 반환
- 실제 법령 내용은 `page.tsx`에서 **다시 API 호출**
- 테스트 스크립트는 법령 내용을 가져오지 않음

---

## ✅ 해결 방안

### 옵션 A: L3 캐시에 법령 전문 포함 (권장) ⭐

**개념**:
- `search_results` 테이블에 `law_content` 컬럼 추가 (JSON)
- 법령 전문(articles)을 Turso DB에 저장
- L1/L3 HIT 시 **완전한 법령 데이터** 반환

**장점**:
- ✅ 한 번의 DB 쿼리로 모든 데이터 획득
- ✅ IndexedDB 불필요 (단순화)
- ✅ 2번째 검색부터 **10ms 이하**
- ✅ 행정규칙과 동일한 사용자 경험

**단점**:
- ⚠️ Turso 스토리지 사용량 증가 (법령당 ~100KB)
- ⚠️ 마이그레이션 필요

**구현 복잡도**: 중간
**예상 성능**: L1 HIT 시 **5-10ms** (전체 데이터 포함)

---

### 옵션 B: IndexedDB 캐시 우선 체크 (간단)

**개념**:
- L0~L4보다 **IndexedDB를 먼저** 체크
- 법령 전문이 IndexedDB에 있으면 즉시 반환
- 없으면 L0~L4 → API 순서로 진행

**장점**:
- ✅ 코드 수정 최소화
- ✅ 즉시 적용 가능
- ✅ 2번째 검색부터 **25ms 이하**

**단점**:
- ⚠️ 여전히 이중 캐시 구조
- ⚠️ 브라우저 간 캐시 공유 불가
- ⚠️ 시크릿 모드/새 브라우저에서 느림

**구현 복잡도**: 낮음
**예상 성능**: IndexedDB HIT 시 **20-30ms**

---

### 옵션 C: 하이브리드 (최적) ⭐⭐⭐

**개념**:
1. **L1~L3**: `lawId` + **메타데이터**만 (Turso DB)
2. **L3.5**: 법령 전문 캐시 (IndexedDB, 우선 체크)
3. **L4**: API 호출 + 양쪽 캐시 저장

**흐름**:
```
검색어 입력
  ↓
IndexedDB 체크 (법령 전문)
  ├─ HIT: 즉시 반환 (20-30ms) ✅
  └─ MISS
      ↓
      L0~L3 캐시 (lawId만)
        ├─ HIT: lawId 반환 → eflaw API 호출 → IndexedDB 저장
        └─ MISS: L4 API 호출 → 학습 → IndexedDB 저장
```

**장점**:
- ✅ 최소한의 코드 변경
- ✅ 2번째 검색: **20-30ms** (IndexedDB)
- ✅ 브라우저 로컬 캐시 활용
- ✅ Turso 스토리지 절약
- ✅ 점진적 개선 가능

**단점**:
- ⚠️ 여전히 이중 캐시 유지

**구현 복잡도**: 낮음
**예상 성능**:
- 1회 검색: L4 API (~2000ms)
- 2회 검색: IndexedDB (~25ms)
- 3회 이후: IndexedDB (~25ms)

---

## 📊 성능 비교표

| 시나리오 | 현재 | 옵션 A | 옵션 B | 옵션 C |
|---------|------|--------|--------|--------|
| 첫 검색 | ~2000ms | ~2000ms | ~2000ms | ~2000ms |
| 2회 검색 (L1 HIT, IndexedDB MISS) | ~2000ms ❌ | ~10ms ✅ | ~25ms ✅ | ~2000ms |
| 2회 검색 (L1 HIT, IndexedDB HIT) | ~35ms ✅ | ~10ms ✅ | ~25ms ✅ | ~25ms ✅ |
| 3회 이후 | ~35ms | ~10ms | ~25ms | ~25ms |
| 새 브라우저 | ~2000ms | ~10ms ✅ | ~2000ms ❌ | ~2000ms ❌ |
| 구현 난이도 | - | 중간 | 낮음 | 낮음 |
| 스토리지 비용 | 낮음 | 높음 | 낮음 | 낮음 |

---

## 🎯 권장 솔루션: **옵션 C (하이브리드)**

### 이유:
1. ✅ **즉시 적용 가능** (1시간 이내)
2. ✅ **최소한의 리스크**
3. ✅ **실질적 성능 개선** (2000ms → 25ms)
4. ✅ **향후 옵션 A로 마이그레이션 가능**

### 구현 단계:

#### Step 1: 검색 흐름 재배치 (app/page.tsx)
```typescript
// BEFORE:
intelligent-search API → lawId 획득
  ↓
IndexedDB 체크
  ↓ (MISS)
eflaw API 호출 (느림!)

// AFTER:
IndexedDB 체크 (rawQuery 기반)
  ↓ (HIT)
즉시 반환 (빠름!)
  ↓ (MISS)
intelligent-search API → lawId 획득
  ↓
eflaw API 호출
  ↓
IndexedDB 저장
```

#### Step 2: IndexedDB 키 체계 변경
```typescript
// BEFORE: lawId + effectiveDate
`${lawId}_${effectiveDate}`

// AFTER: 검색 쿼리 + lawId (중복 키)
`query:${normalizedQuery}`  // 빠른 검색용
`lawId:${lawId}_${effectiveDate}`  // 기존 호환성
```

#### Step 3: 캐시 TTL 설정
- IndexedDB: 7일 (자동 삭제)
- Turso L1~L3: 영구 (작은 데이터)

---

## 🚀 예상 개선 효과

### 사용자 경험:
- **첫 검색**: 2초 (변화 없음)
- **두 번째 검색**: **2초 → 0.03초** (66배 개선!)
- **이후 검색**: 0.03초 유지

### 시스템 부하:
- API 호출: **50% 감소** (반복 검색 대부분 캐시 HIT)
- Turso 쿼리: 변화 없음 (작은 데이터)
- 브라우저 스토리지: 법령당 ~100KB (허용 범위)

---

## 📝 다음 단계

1. ✅ 옵션 C 구현 (우선)
2. ⏳ 성능 모니터링 (1주일)
3. ⏳ 옵션 A 마이그레이션 검토 (선택)

---

## 🧪 테스트 계획

### 테스트 케이스:
1. "관세법 38조" 첫 검색 → IndexedDB 저장 확인
2. "관세법 38조" 재검색 → IndexedDB HIT 확인 (<50ms)
3. "관셰법 38조" (오타) → 정규화 후 IndexedDB HIT 확인
4. 브라우저 재시작 → IndexedDB 유지 확인
5. 7일 후 → 자동 삭제 확인

### 성공 기준:
- ✅ 2회 검색부터 50ms 이하
- ✅ API 호출 50% 감소
- ✅ 에러율 변화 없음
