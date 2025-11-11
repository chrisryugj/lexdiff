# RAG Content Filtering 전략

## 📌 문제 정의

### 상황
```
사용자: "광진구와 성동구의 4차산업 관련 조례를 비교해줘"

수집된 데이터:
- 광진구 4차산업혁명 대응 산업진흥 조례: 50개 조문 (약 25,000 chars)
- 성동구 4차산업혁명 대응 조례: 45개 조문 (약 22,000 chars)

총: 95개 조문, ~47,000 chars
```

### 문제점
1. **토큰 제한**: Gemini 2.0 Flash는 1M 토큰 입력 가능하지만, 전체 전달 시:
   - 비용 증가 (~$0.003/쿼리)
   - 응답 품질 저하 (노이즈 증가)
   - 처리 시간 증가

2. **관련성 문제**: 95개 조문 중 "4차산업 지원"과 직접 관련된 것은 10~15개뿐
   - 나머지는 시행일, 부칙, 일반적인 행정 절차 등

3. **사용자 경험**: 불필요한 정보로 인해 핵심 비교가 어려움

---

## 🎯 해결 전략: 4단계 Adaptive Filtering

### Strategy Overview

```
┌─────────────────────────────────────────────────┐
│  Step 1: 크기 체크                               │
│  - 조문 수 ≤ 30개 AND 길이 ≤ 15,000 chars       │
│  → 전체 포함 (필터링 불필요)                     │
└─────────────────────────────────────────────────┘
                    ↓ (필터링 필요)
┌─────────────────────────────────────────────────┐
│  Step 2: 키워드 기반 필터링 ⭐ (Primary)         │
│  - Intent 분석에서 추출된 키워드 사용            │
│  - 조문별 매칭 점수 계산                         │
│  - 상위 30개 조문 선택                           │
└─────────────────────────────────────────────────┘
                    ↓ (매칭 실패)
┌─────────────────────────────────────────────────┐
│  Step 3: 목차 + 중요 조문 (Fallback)             │
│  - 전체 목차 제공 (구조 파악)                    │
│  - 중요 조문만 추출 (목적, 정의, 지원대상 등)    │
│  - 최대 10개 조문                                │
└─────────────────────────────────────────────────┘
                    ↓ (최후의 수단)
┌─────────────────────────────────────────────────┐
│  Step 4: 요약본 (Summary)                        │
│  - 처음 5개 조문만 포함                          │
│  - "전체 내용이 매우 길어 일부만 표시" 안내      │
└─────────────────────────────────────────────────┘
```

---

## 🔍 Step 2: 키워드 기반 필터링 (핵심!)

### 키워드 추출 로직

```typescript
// 1. Intent 분석에서 추출
const keywords = []
session.intent.targets.forEach((target) => {
  if (target.keywords) {
    keywords.push(...target.keywords)
    // 예: ["4차산업", "산업진흥", "혁신"]
  }
})

// 2. 사용자 쿼리에서 추가 추출
const queryWords = userQuery
  .split(/\s+/)
  .filter((word) => word.length >= 2)
  .filter((word) => !stopWords.includes(word))  // 불용어 제거

keywords.push(...queryWords)

// 3. 중복 제거
const uniqueKeywords = Array.from(new Set(keywords))

// 결과: ["4차산업", "산업진흥", "혁신", "광진구", "성동구", "비교"]
```

### 조문별 매칭 점수 계산

```typescript
const scored = articles.map((article) => {
  const searchText = `${article.joNum} ${article.content}`.toLowerCase()
  let score = 0

  for (const keyword of keywords) {
    // 완전 매칭: +10점
    if (searchText.includes(keyword.toLowerCase())) {
      score += 10
    }

    // 부분 매칭: +5점 × 매칭 횟수
    const matches = searchText.split(keyword.toLowerCase()).length - 1
    score += matches * 5
  }

  return { article, score }
})

// 점수 높은 순으로 정렬
scored.sort((a, b) => b.score - a.score)

// 점수 > 0인 조문만 선택 (최대 30개)
return scored.filter(s => s.score > 0).slice(0, 30)
```

### 예시: "광진구 4차산업 조례" (50개 조문)

```
원본 조문 목록:
1. 제1조(목적) - 점수: 25 ✅
   → "4차산업혁명" (10점) + "산업진흥" (10점) + "혁신" (5점)

2. 제2조(정의) - 점수: 20 ✅
   → "4차산업혁명" (10점) + "혁신" (10점)

3. 제3조(지원대상) - 점수: 35 ✅
   → "4차산업" (10점) + "산업" (5점) + "지원" (10점) + "혁신기업" (10점)

...

25. 제25조(시행일) - 점수: 0 ❌
   → 매칭 없음

26. 제26조(경과조치) - 점수: 0 ❌
   → 매칭 없음

필터 결과:
- 포함: 15개 조문 (점수 > 0)
- 제외: 35개 조문 (점수 = 0)
- 압축률: 70% 감소
```

---

## 📊 Step 3: 목차 + 중요 조문 (Fallback)

### 언제 사용?
- 키워드 매칭이 실패한 경우
- 또는 사용자가 "전체 구조를 알려줘" 같은 질문

### 목차 생성

```typescript
function buildTableOfContents(source: CollectedSource): string {
  const toc = source.articles
    .map((article) => {
      const titleMatch = article.joNum.match(/\(([^)]+)\)/)
      const title = titleMatch ? titleMatch[1] : ''
      return `${article.jo}. ${article.joNum}${title ? ` - ${title}` : ''}`
    })
    .join('\n')

  return `
**목차 (총 ${source.articles.length}개 조문)**

${toc}

**참고**: 전체 조문이 많아 일부만 표시합니다.
필요 시 특정 조문을 요청하세요.
`
}
```

### 중요 조문 추출

```typescript
const importantPatterns = [
  /목적/,
  /정의/,
  /용어/,
  /지원대상/,
  /지원내용/,
  /예산/,
  /재원/,
  /시행일/,
  /부칙/,
]

const important = articles.filter((article) => {
  const text = `${article.joNum} ${article.content}`
  return importantPatterns.some((pattern) => pattern.test(text))
})

// 최대 10개만
return important.slice(0, 10)
```

### 출력 예시

```markdown
## 소스 1: 광진구 4차산업혁명 대응 산업진흥 조례

**메타데이터**:
- 전체 조문 수: 50개
- 포함된 조문: 10개 (toc 방식)
- 제외된 조문: 40개

**내용**:

**목차 (총 50개 조문)**

001. 제1조(목적)
002. 제2조(정의)
003. 제3조(지원대상)
...
050. 제50조(부칙)

**참고**: 전체 조문이 많아 일부만 표시합니다.

---

**주요 조문 (10개)**

제1조(목적)
이 조례는 광진구의 4차 산업혁명에 대응하여...

제2조(정의)
이 조례에서 사용하는 용어의 뜻은 다음과 같다...

...
```

---

## 💡 실제 동작 예시

### Example 1: "4차산업 지원금액" 질문

```
사용자: "광진구의 4차산업 지원 금액 한도는?"

키워드 추출:
["4차산업", "지원", "금액", "한도", "광진구"]

필터링 결과 (50개 → 8개):
1. 제3조(지원대상) - 점수: 35
2. 제5조(지원내용) - 점수: 40 ⭐
3. 제6조(지원한도) - 점수: 50 ⭐⭐
4. 제7조(예산) - 점수: 25
5. 제8조(지원절차) - 점수: 30
6. 제12조(지원금 교부) - 점수: 35
7. 제20조(재정지원) - 점수: 20
8. 제25조(보조금 관리) - 점수: 15

AI에 전달되는 콘텐츠:
- 8개 조문만 포함 (~3,500 chars)
- 42개 조문 제외 (~21,500 chars)
- 압축률: 84% 감소 ✅

AI 응답:
"제6조(지원한도)에 따르면, 4차산업 관련 기업에 대한
지원 금액은 연간 최대 5천만원입니다..."
```

### Example 2: "두 조례 비교" 질문

```
사용자: "광진구와 성동구의 4차산업 조례를 비교해줘"

키워드 추출:
["4차산업", "산업진흥", "혁신", "비교"]

필터링 결과:

[광진구] 50개 → 15개 조문
- 제1조(목적)
- 제2조(정의)
- 제3조(지원대상)
- 제5조(지원내용)
- 제6조(지원한도)
...

[성동구] 45개 → 12개 조문
- 제1조(목적)
- 제2조(정의)
- 제4조(지원대상)
- 제6조(지원내용)
...

총: 95개 → 27개 조문
압축률: 72% 감소 ✅

AI에 전달:
- 광진구 15개 조문 (~6,000 chars)
- 성동구 12개 조문 (~5,000 chars)
- 합계: ~11,000 chars (원본 47,000 chars)

AI 응답:
"두 조례를 비교한 결과:

1. 목적의 차이
   - 광진구: 4차 산업혁명 '대응'에 초점
   - 성동구: 신산업 '육성'에 초점

2. 지원대상
   - 광진구: 중소기업 중심
   - 성동구: 스타트업 포함

..."
```

---

## 📈 성능 비교

### 비용 절감

| 시나리오 | 필터링 전 | 필터링 후 | 절감률 |
|---------|----------|----------|--------|
| 단일 조례 (50개) | ~25,000 chars | ~6,000 chars | 76% |
| 비교 (2개) | ~47,000 chars | ~11,000 chars | 77% |
| 비교 (3개) | ~70,000 chars | ~16,000 chars | 77% |

### 토큰 비용

```
필터링 전 (비교 2개):
- 입력 토큰: ~12,000
- 비용: ~$0.0009

필터링 후:
- 입력 토큰: ~3,000
- 비용: ~$0.00023

절감: 74% ✅
```

### 응답 품질

```
필터링 전:
❌ "... 조례의 시행일은... 경과조치는... (불필요한 정보)"
❌ 핵심 내용이 희석됨

필터링 후:
✅ "지원대상은... 지원내용은... (핵심만)"
✅ 명확하고 집중된 답변
```

---

## 🔧 향후 개선 방향

### 1. Two-Pass Approach (고급)

```
Pass 1: AI에게 목차만 보여주고 필요한 조문 선택하게 함

프롬프트:
"다음은 광진구 4차산업 조례의 목차입니다.
'4차산업 지원금액'을 답변하려면 어떤 조문이 필요한가요?
조문 번호만 나열하세요."

AI 응답: "003, 005, 006, 007"

Pass 2: 선택된 조문만 전체 내용과 함께 전달

장점: AI가 직접 판단 → 더 정확
단점: API 호출 2회 (비용 증가)
```

### 2. 임베딩 기반 검색 (Phase 10)

```typescript
// 사용자 질문 임베딩
const questionEmbedding = await voyageAI.embed(userQuery)

// 각 조문 임베딩 (사전 생성)
const articleEmbeddings = await getArticleEmbeddings(source)

// 코사인 유사도 계산
const similarities = articleEmbeddings.map((emb, index) => ({
  article: articles[index],
  similarity: cosineSimilarity(questionEmbedding, emb)
}))

// 유사도 높은 순으로 선택
return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 30)
```

### 3. 청크 분할 + 재순위 (Reranking)

```typescript
// 1. 조문을 청크로 분할 (예: 5개씩)
const chunks = splitIntoChunks(articles, 5)

// 2. 각 청크별로 독립 분석
const chunkResults = await Promise.all(
  chunks.map(chunk => analyzeChunk(chunk, userQuery))
)

// 3. 결과 병합 및 재순위
const reranked = rerank(chunkResults)
```

---

## 📝 사용 방법

### 자동 적용 (기본)

```typescript
// RAG Analyzer API에서 자동으로 필터링 적용
// 사용자는 신경 쓸 필요 없음

const filteredSources = filterMultipleSources(session.sources, keywords, {
  maxArticles: 30,
  maxContentLength: 15000,
  includeTableOfContents: true,
})
```

### 수동 조정 (고급)

```typescript
// 더 많은 조문 포함하고 싶을 때
const filteredSources = filterMultipleSources(session.sources, keywords, {
  maxArticles: 50,  // 기본 30 → 50
  maxContentLength: 25000,  // 기본 15000 → 25000
  includeTableOfContents: false,  // 목차 제외
})
```

---

## 🎯 결론

### 핵심 전략
1. **Adaptive Filtering**: 상황에 따라 4가지 전략 자동 선택
2. **키워드 기반**: 가장 빠르고 효과적 (Primary)
3. **목차 + 중요 조문**: 구조 파악용 (Fallback)
4. **요약**: 최후의 수단

### 효과
- ✅ **비용 절감**: 70~80% 토큰 감소
- ✅ **응답 품질**: 핵심 정보만 전달 → 명확한 답변
- ✅ **처리 속도**: 입력 토큰 감소 → 빠른 응답
- ✅ **사용자 경험**: 불필요한 정보 없이 핵심만

### 자동화
- 사용자는 신경 쓸 필요 없음
- RAG Analyzer가 자동으로 최적화
- 로그로 필터링 결과 확인 가능

**완벽한 Small RAG 시스템!** 🚀
