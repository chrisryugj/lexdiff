# 시행령/시행규칙/자치법규 파싱 확장 계획

## 목표

현재 `data/parsed-laws`에 저장된 법령들에 대한 **시행령, 시행규칙, 자치법규**를 자동으로 파싱하여 RAG 시스템에 추가

---

## 1. 시행령/시행규칙 자동 파싱

### 1.1 기본 개념

- **법률 (法律)**: 국회에서 제정하는 법
- **시행령 (施行令)**: 대통령령으로 법률의 시행에 필요한 사항을 규정 (예: 관세법 시행령)
- **시행규칙 (施行規則)**: 부령으로 시행령에서 위임한 사항을 규정 (예: 관세법 시행규칙)

### 1.2 API 엔드포인트 (law.go.kr)

#### (1) 관련 법령 검색
```
GET https://www.law.go.kr/DRF/lawSearch.do
Parameters:
  - query: {법령명} (예: "관세법")
  - display: 결과 개수
  - OC: API 인증키
  - type: JSON
```

**응답 예시**:
```json
{
  "LawSearch": {
    "law": [
      {
        "법령ID": "001556",
        "법령명_한글": "관세법",
        "법령구분명": "법률"
      },
      {
        "법령ID": "001557",
        "법령명_한글": "관세법 시행령",
        "법령구분명": "대통령령"
      },
      {
        "법령ID": "001558",
        "법령명_한글": "관세법 시행규칙",
        "법령구분명": "부령"
      }
    ]
  }
}
```

#### (2) 법령 내용 조회
```
GET https://www.law.go.kr/DRF/lawService.do
Parameters:
  - target: eflaw
  - ID: {법령ID}
  - OC: API 인증키
  - type: JSON
```

### 1.3 구현 방안

#### Phase 1: 관련 법령 매핑
```typescript
// scripts/fetch-related-decrees.mts
interface RelatedDecree {
  baseLaw: string          // "관세법"
  baseLawId: string        // "001556"
  decree?: {               // 시행령
    lawId: string
    lawName: string
  }
  rule?: {                 // 시행규칙
    lawId: string
    lawName: string
  }
}

async function findRelatedDecrees(baseLawName: string, baseLawId: string) {
  // 1. "{baseLawName} 시행령" 검색
  const decreeResults = await searchLaw(`${baseLawName} 시행령`)

  // 2. "{baseLawName} 시행규칙" 검색
  const ruleResults = await searchLaw(`${baseLawName} 시행규칙`)

  // 3. 매칭 (법령구분명으로 필터링)
  const decree = decreeResults.find(r => r.법령구분명 === "대통령령")
  const rule = ruleResults.find(r => r.법령구분명 === "부령")

  return { baseLaw: baseLawName, baseLawId, decree, rule }
}
```

#### Phase 2: 시행령/시행규칙 다운로드
```typescript
// scripts/download-decrees.mts
async function downloadDecree(lawId: string, lawName: string, type: '시행령' | '시행규칙') {
  // 1. 법령 내용 조회 (eflaw API)
  const data = await fetchLawData(lawId)

  // 2. 마크다운 변환
  const markdown = formatLawAsMarkdown(data, lawName, type)

  // 3. 파일 저장
  const fileName = sanitizeFilename(`${lawName}.md`)
  await fs.writeFile(`data/parsed-laws/${fileName}`, markdown)

  // 4. 메타데이터 저장
  const metadata = {
    lawId,
    lawName,
    lawType: type,
    baseLaw: extractBaseLawName(lawName), // "관세법 시행령" → "관세법"
    effectiveDate: data.법령?.시행일자,
    articleCount: data.법령?.조문?.조문단위?.length || 0
  }
  await fs.writeFile(`data/parsed-laws/${fileName}.meta.json`, JSON.stringify(metadata, null, 2))
}
```

#### Phase 3: 일괄 처리
```typescript
// scripts/fetch-all-decrees.mts
async function main() {
  // 1. data/parsed-laws 스캔
  const existingLaws = await listParsedLaws()

  // 2. 법률만 필터링 (시행령/시행규칙 제외)
  const baseLaws = existingLaws.filter(law =>
    !law.lawName.includes('시행령') &&
    !law.lawName.includes('시행규칙')
  )

  // 3. 각 법률에 대한 시행령/시행규칙 검색 및 다운로드
  for (const baseLaw of baseLaws) {
    const related = await findRelatedDecrees(baseLaw.lawName, baseLaw.lawId)

    if (related.decree) {
      await downloadDecree(related.decree.lawId, related.decree.lawName, '시행령')
    }

    if (related.rule) {
      await downloadDecree(related.rule.lawId, related.rule.lawName, '시행규칙')
    }

    // Rate limiting
    await sleep(1000)
  }
}
```

---

## 2. 자치법규 (조례/규칙) 파싱

### 2.1 기본 개념

- **조례 (條例)**: 지방의회에서 제정하는 자치법규
- **규칙 (規則)**: 지방자치단체장이 제정하는 자치법규

### 2.2 API 엔드포인트 (law.go.kr)

#### (1) 조례/규칙 검색
```
GET https://www.law.go.kr/DRF/ordinInfoService.do
Parameters:
  - ordinNm: {조례명} (예: "세금 감면")
  - display: 결과 개수
  - OC: API 인증키
  - type: JSON
```

**응답 예시**:
```json
{
  "OrdinInfoService": {
    "row": [
      {
        "ordinSeq": "12345",
        "ordinNm": "서울특별시 세금 감면 조례",
        "ordinSe": "조례",
        "mstCd": "110000", // 서울특별시
        "jurisdNm": "서울특별시",
        "enfoDate": "20240101"
      }
    ]
  }
}
```

#### (2) 조례/규칙 내용 조회
```
GET https://www.law.go.kr/DRF/ordinInfoService.do
Parameters:
  - ordinSeq: {조례일련번호}
  - OC: API 인증키
  - type: XML (JSON 지원 안 함)
```

### 2.3 구현 방안 (기존 코드 참고)

#### 참고 파일
- `app/api/ordin-search/route.ts` - 조례 검색 API
- `app/api/ordin/route.ts` - 조례 내용 조회 API
- `app/page.tsx` - 조례 파싱 로직 (isOrdinanceQuery 검사)

#### Phase 1: 조례/규칙 검색 확장
```typescript
// 기존: 특정 조례 검색
const isOrdinanceQuery = /조례|규칙|특별시|광역시|도|시|군|구/.test(query)

// 확장: 특정 주제에 대한 전국 조례 검색
async function searchOrdinancesByTopic(topic: string, jurisdiction?: string) {
  const url = `https://www.law.go.kr/DRF/ordinInfoService.do`
  const params = {
    ordinNm: topic,
    display: 100,
    OC: process.env.LAW_OC,
    type: 'JSON'
  }

  if (jurisdiction) {
    // 특정 지역 필터링
    params.mstCd = getJurisdictionCode(jurisdiction)
  }

  const response = await fetch(url + '?' + new URLSearchParams(params))
  const data = await response.json()

  return data.OrdinInfoService?.row || []
}
```

#### Phase 2: 조례/규칙 다운로드
```typescript
// scripts/download-ordinances.mts
async function downloadOrdinance(ordinSeq: string, ordinNm: string) {
  // 1. 조례 내용 조회 (XML)
  const xmlData = await fetchOrdinanceXML(ordinSeq)

  // 2. XML 파싱
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlData, 'text/xml')

  // 3. 조문 추출 (app/page.tsx 로직 참고)
  const articles = parseOrdinanceArticles(doc)

  // 4. 마크다운 변환
  const markdown = formatOrdinanceAsMarkdown(ordinNm, articles)

  // 5. 파일 저장
  const fileName = sanitizeFilename(`${ordinNm}.md`)
  await fs.writeFile(`data/parsed-ordinances/${fileName}`, markdown)
}
```

#### Phase 3: 특정 법령 관련 조례 검색
```typescript
// 예: 관세법 관련 조례 검색
async function findRelatedOrdinances(baseLawName: string) {
  // 주요 키워드 추출
  const keywords = extractKeywords(baseLawName) // "관세법" → ["관세", "통관", "수출", "수입"]

  const relatedOrdinances = []

  for (const keyword of keywords) {
    const results = await searchOrdinancesByTopic(keyword)
    relatedOrdinances.push(...results)
  }

  // 중복 제거
  return deduplicateOrdinances(relatedOrdinances)
}
```

---

## 3. 파일 구조

### 3.1 디렉토리 구조
```
data/
├── parsed-laws/              # 법률 + 시행령 + 시행규칙
│   ├── 관세법.md
│   ├── 관세법.meta.json
│   ├── 관세법_시행령.md
│   ├── 관세법_시행령.meta.json
│   ├── 관세법_시행규칙.md
│   ├── 관세법_시행규칙.meta.json
│   └── ...
│
└── parsed-ordinances/        # 자치법규 (조례/규칙)
    ├── 서울특별시_세금감면_조례.md
    ├── 서울특별시_세금감면_조례.meta.json
    └── ...
```

### 3.2 메타데이터 스키마
```typescript
interface LawMetadata {
  lawId: string
  lawName: string
  lawType: '법률' | '시행령' | '시행규칙'
  baseLaw?: string           // "관세법 시행령" → "관세법"
  effectiveDate: string
  articleCount: number
  fetchedAt: string
}

interface OrdinanceMetadata {
  ordinSeq: string
  ordinNm: string
  ordinSe: '조례' | '규칙'
  jurisdiction: string       // "서울특별시"
  mstCd: string             // "110000"
  enfoDate: string
  articleCount: number
  relatedLaws?: string[]    // 관련 법률 목록
  fetchedAt: string
}
```

---

## 4. RAG 통합

### 4.1 임베딩 구축
```typescript
// scripts/build-decree-embeddings.mts
async function buildDecreeEmbeddings() {
  // 1. data/parsed-laws 스캔 (시행령/시행규칙 포함)
  const allLaws = await listParsedLaws()

  // 2. 각 법령 임베딩 생성
  for (const law of allLaws) {
    const articles = await parseMarkdownArticles(law.markdownPath)

    for (const article of articles) {
      const embedding = await generateEmbedding(article.content)

      await insertEmbedding({
        law_id: law.lawId,
        law_name: law.lawName,
        law_type: law.lawType, // NEW: 법률/시행령/시행규칙 구분
        article_jo: article.jo,
        article_display: article.display,
        article_content: article.content,
        content_embedding: embedding
      })
    }
  }
}
```

### 4.2 검색 결과 필터링
```typescript
// 사용자가 "시행령 포함" 옵션 선택 시
interface RagSearchOptions {
  includeDerees: boolean      // 시행령 포함 여부
  includeRules: boolean       // 시행규칙 포함 여부
  includeOrdinances: boolean  // 조례 포함 여부
}

async function ragSearch(query: string, options: RagSearchOptions) {
  const lawTypes = ['법률']

  if (options.includeDecrees) lawTypes.push('시행령')
  if (options.includeRules) lawTypes.push('시행규칙')
  if (options.includeOrdinances) lawTypes.push('조례', '규칙')

  // WHERE law_type IN (lawTypes)
  const results = await vectorSearch(query, lawTypes)

  return results
}
```

---

## 5. 실행 계획

### Phase 1: 시행령/시행규칙 자동 파싱 (1-2일)
1. ✅ 스크립트 작성: `scripts/fetch-related-decrees.mts`
2. ✅ 스크립트 작성: `scripts/download-all-decrees.mts`
3. ✅ 테스트: 관세법 시행령/시행규칙 다운로드
4. ✅ 일괄 실행: 30개 법령에 대한 시행령/시행규칙 다운로드
5. ✅ 업로드: File Search Store에 업로드

### Phase 2: 자치법규 파싱 (2-3일)
1. ✅ 스크립트 작성: `scripts/search-related-ordinances.mts`
2. ✅ 스크립트 작성: `scripts/download-ordinances.mts`
3. ✅ 테스트: 관세 관련 조례 검색 및 다운로드
4. ✅ 일괄 실행: 주요 법령 관련 조례 다운로드
5. ✅ 업로드: File Search Store에 업로드

### Phase 3: RAG 통합 (1일)
1. ✅ 임베딩 구축: 시행령/시행규칙/조례 임베딩 생성
2. ✅ UI 개선: 검색 옵션 추가 (시행령/규칙/조례 포함 여부)
3. ✅ 테스트: 통합 검색 테스트

---

## 6. 예상 비용

### 임베딩 생성 비용
- **시행령**: 30개 법령 × 1개 시행령 × 100조 × 200토큰 = ~600,000 토큰
- **시행규칙**: 30개 법령 × 1개 시행규칙 × 50조 × 200토큰 = ~300,000 토큰
- **조례**: 30개 법령 × 10개 조례 × 30조 × 200토큰 = ~1,800,000 토큰

**총 임베딩 비용**: ~2,700,000 토큰 × $0.05/1M = **$0.135** (약 180원)

### API 호출 비용
- **검색 API**: 30개 법령 × 2회 (시행령/시행규칙) = 60회
- **내용 조회 API**: ~100회 (시행령/시행규칙/조례 합산)

**총 비용**: ~$0.15 (약 200원)

---

## 7. 참고 파일

### 기존 구현 참고
- `app/api/ordin-search/route.ts` - 조례 검색 API
- `app/api/ordin/route.ts` - 조례 내용 조회 API
- `app/page.tsx:835-900` - 조례 파싱 로직
- `lib/law-parser.ts` - 법령 파싱 유틸리티

### 새로 작성할 스크립트
- `scripts/fetch-related-decrees.mts` - 시행령/시행규칙 검색
- `scripts/download-all-decrees.mts` - 일괄 다운로드
- `scripts/search-related-ordinances.mts` - 조례 검색
- `scripts/download-ordinances.mts` - 조례 다운로드

---

## 8. 주의사항

### 8.1 법령명 매칭
- **정확한 매칭**: "관세법" → "관세법 시행령" (O)
- **부분 매칭 방지**: "관세" → "관세법 시행령", "관세사법 시행령" (X)
- **해결**: 검색 결과에서 법령명 정확도 확인

### 8.2 Rate Limiting
- law.go.kr API는 1초당 1-2회 호출 권장
- 100개 이상 다운로드 시 1초 대기 (`await sleep(1000)`)

### 8.3 중복 방지
- 이미 다운로드된 파일은 스킵
- 파일명 sanitization 일관성 유지

---

이 계획서를 바탕으로 단계별로 구현하면, RAG 시스템의 정확도와 범위를 크게 향상시킬 수 있습니다.
