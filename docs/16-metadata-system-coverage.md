# 메타데이터 시스템 적용 범위

## ✅ 적용 완료된 업로드 경로

### 1. 법령/시행령/시행규칙 업로드 (LawUploadPanelV2)

**UI 경로**: `/admin` → "데이터 처리" → "법령 업로드"

**파일**: `components/admin/law-upload-panel-v2.tsx:224-240`

**처리 방식**:
```typescript
// 단일 파일 업로드
async function uploadSingleFile(fileName: string) {
  const { extractLawMetadata } = await import('@/lib/law-metadata-extractor')
  const extractedMetadata = extractLawMetadata(data.markdown, fileName)

  const metadata = {
    ...extractedMetadata,  // ✅ 메타데이터 자동 추출
    file_name: fileName,
    upload_source: 'law-upload-panel-v2'
  }

  // → /api/admin/batch-upload-files 호출
}
```

**적용 대상**:
- ✅ 법률 (예: 관세법.md)
- ✅ 시행령 (예: 관세법 시행령.md)
- ✅ 시행규칙 (예: 관세법 시행규칙.md)
- ✅ 행정규칙 (예: 관세청 고시.md) ← `detectLawType()`이 자동 분류

**단일/일괄 업로드**: 둘 다 지원 (같은 함수 사용)

---

### 2. 조례 업로드 (OrdinanceUploadPanel)

**UI 경로**: `/admin` → "데이터 처리" → "조례 업로드"

**파일**: `app/api/admin/upload-parsed-ordinance/route.ts:62-151`

**처리 방식**:
```typescript
// 단일 조례 업로드
async function POST(request) {
  const { extractLawMetadata } = await import('@/lib/law-metadata-extractor')
  const extractedMetadata = extractLawMetadata(markdownContent, fileName)

  const customMetadata = [
    { key: 'law_name', stringValue: extractedMetadata.law_name },
    { key: 'law_id', stringValue: extractedMetadata.law_id },
    { key: 'law_type', stringValue: extractedMetadata.law_type },  // ✅ '조례' 또는 '시행규칙'
    { key: 'effective_date', stringValue: extractedMetadata.effective_date },
    { key: 'total_articles', stringValue: extractedMetadata.total_articles },
    { key: 'region', stringValue: extractedMetadata.region },  // ✅ 지역 자동 추출
    // ...
  ]
}
```

**적용 대상**:
- ✅ 조례 (예: 서울특별시 조례.md)
- ✅ 조례 시행규칙 (예: 서울특별시 조례 시행규칙.md)

**단일/일괄 업로드**: 둘 다 지원
- 일괄 업로드: `/api/admin/batch-upload-ordinances` → 단일 업로드 API 반복 호출

---

## 📊 법령 유형 자동 감지 로직

**함수**: `detectLawType(lawName)` (`lib/law-metadata-extractor.ts:110-129`)

**감지 우선순위**:

1. **시행규칙** (최우선)
   - 패턴: `/시행규칙$/` (끝나는 문자열)
   - 예: "관세법 시행규칙" → `시행규칙`

2. **시행령**
   - 패턴: `/시행령$/`
   - 예: "관세법 시행령" → `시행령`

3. **조례**
   - 키워드: `/조례|규칙/`
   - 지역명 패턴: `/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/`
   - 예:
     - "서울특별시 조례" → `조례`
     - "강남구 조례 시행규칙" → `조례` (조례 키워드 우선)

4. **법률** (기본값)
   - 위 3가지에 해당하지 않으면 법률로 분류
   - 예: "관세법" → `법률`

**행정규칙 처리**:
- 현재는 별도 구분 없이 **법률**로 분류됨
- 필요 시 `detectLawType()` 수정으로 '행정규칙' 타입 추가 가능
- 예: "관세청 고시" → 현재는 `법률`, 수정하면 `행정규칙` 가능

---

## 🔍 테스트 결과

### 메타데이터 추출 테스트 (`scripts/test-metadata-extraction.mjs`)

```bash
✅ 관세법.md
   law_type: 법률
   law_id: 001556
   effective_date: 20251111
   total_articles: 423

✅ 관세법 시행령.md
   law_type: 시행령
   law_id: 002421
   effective_date: 20251001
   total_articles: 438

✅ 관세법 시행규칙.md
   law_type: 시행규칙
   law_id: 006392
   effective_date: 20251031
   total_articles: 144

✅ 고용보험법.md
   law_type: 법률
   law_id: 001761
   effective_date: 20251001
   total_articles: 147
```

---

## ✅ 전체 적용 범위 체크리스트

| 법령 유형 | 단일 업로드 | 일괄 업로드 | 자동 감지 | 테스트 |
|----------|-----------|-----------|---------|--------|
| **법률** | ✅ | ✅ | ✅ | ✅ |
| **시행령** | ✅ | ✅ | ✅ | ✅ |
| **시행규칙** | ✅ | ✅ | ✅ | ✅ |
| **행정규칙** | ✅ | ✅ | ⚠️ (법률로 분류) | - |
| **조례** | ✅ | ✅ | ✅ | - |
| **조례 시행규칙** | ✅ | ✅ | ⚠️ (조례로 분류) | - |

**범례**:
- ✅ 완전 지원
- ⚠️ 부분 지원 (개선 가능)
- ❌ 미지원

---

## 🔧 향후 개선 사항 (선택적)

### 1. 행정규칙 별도 분류

**현재**: 행정규칙 (고시, 예규, 훈령 등)이 `법률`로 분류됨

**개선안**:
```typescript
// lib/law-metadata-extractor.ts:110-129 수정
export function detectLawType(lawName: string) {
  if (/시행규칙$/.test(lawName)) return '시행규칙'
  if (/시행령$/.test(lawName)) return '시행령'

  // ✅ 행정규칙 패턴 추가
  if (/고시|예규|훈령|지침|규정/.test(lawName)) {
    return '행정규칙'
  }

  if (/조례|규칙/.test(lawName)) return '조례'
  return '법률'
}
```

**필요성**: ⭐⭐ (중간)
- 검색 필터링 시 행정규칙만 조회 가능
- 법률/행정규칙 구분 명확화

### 2. 조례 시행규칙 별도 분류

**현재**: "서울특별시 조례 시행규칙" → `조례`로 분류

**개선안**:
```typescript
export function detectLawType(lawName: string) {
  if (/시행규칙$/.test(lawName)) {
    // 조례 시행규칙 vs 법률 시행규칙 구분
    if (/조례/.test(lawName) || /지역명패턴/.test(lawName)) {
      return '조례-시행규칙'
    }
    return '시행규칙'
  }
  // ...
}
```

**필요성**: ⭐ (낮음)
- 현재도 조례 관련 문서로 필터링 가능
- 세분화 필요시에만 적용

---

## 📝 요약

**모든 업로드 경로에 메타데이터 시스템 적용 완료**:
- ✅ 법령/시행령/시행규칙: `LawUploadPanelV2` 경로
- ✅ 조례/조례규칙: `OrdinanceUploadPanel` 경로
- ✅ 단일 업로드 + 일괄 업로드 모두 지원
- ✅ 법령 유형 자동 감지 (`detectLawType`)
- ✅ 메타데이터 추출 테스트 완료
- ✅ **Numeric metadata filtering 구현 및 검증 완료** (2025-11-20)

---

## 🔬 Metadata Filtering 테스트 결과 (2025-11-20)

### 테스트 환경
- **Store**: `fileSearchStores/251120-jnt8dqxpea44` (테스트 전용)
- **Model**: gemini-2.5-flash
- **Test File**: 도로법.md (law_id: 001821, effective_date: 20251001)

### 테스트 결과: ✅ **5/5 모든 테스트 통과**

| Test | Filter | Expected | Result | Status |
|------|--------|----------|--------|--------|
| String filter | `law_type="법률"` | Match | 5 chunks | ✅ |
| Numeric filter (>=) | `effective_date>=20240101` | Match | 5 chunks | ✅ |
| Numeric boundary (>) | `effective_date>20260101` | No match | 0 chunks | ✅ |
| Combined AND | `law_type="법률" AND effective_date>=20240101` | Match | 5 chunks | ✅ |
| Negative test | `law_type="시행령" AND effective_date>=20240101"` | No match | 0 chunks | ✅ |

---

## ⚠️ 중요 발견사항

### 1. Numeric Metadata Filter Syntax (CRITICAL)

**String values**: Quotes 사용 **필수**
```javascript
law_type="법률"  // ✅ Works
```

**Numeric values**: Quotes **사용 금지**
```javascript
effective_date>=20240101      // ✅ Works (5 chunks)
effective_date>="20240101"    // ❌ Fails (0 chunks)
```

### 2. Numeric Value Storage (CRITICAL)

`effective_date`는 **numericValue**로 저장해야 numeric comparison 가능:

```typescript
// ✅ Correct (numeric filtering 가능)
customMetadata.push({
  key: 'effective_date',
  numericValue: parseInt('20251001', 10)  // → 20251001
})

// ❌ Wrong (numeric filtering 불가)
customMetadata.push({
  key: 'effective_date',
  stringValue: '20251001'  // String으로 저장되면 >= 비교 안 됨
})
```

**구현 위치**:
- [batch-upload-files/route.ts:121-126](c:\github_project\lexdiff\app\api\admin\batch-upload-files\route.ts#L121-L126)
- [upload-parsed-ordinance/route.ts:131-138](c:\github_project\lexdiff\app\api\admin\upload-parsed-ordinance\route.ts#L131-L138)

### 3. SDK vs REST API

**Google Gen AI SDK**: `groundingMetadata` 반환 안 됨
- `genAI.models.generateContent()` 사용 시 `groundingChunks: []` (빈 배열)
- SDK 버그 의심

**REST API**: 정상 작동 ✅
- Direct fetch to `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- `groundingChunks` 정상 반환

**프로젝트는 REST API 사용 중**: [file-search-client.ts:250-260](c:\github_project\lexdiff\lib\file-search-client.ts#L250-L260)
