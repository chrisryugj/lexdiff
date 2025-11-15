# 학습 시스템 개선 방안 (2025-11-11)

## 🚨 현재 문제점

### 1. 무조건 성공으로 기록하는 악순환
```typescript
// 현재 로직 (search-learning.ts:learnFromSuccessfulSearch)
// "형법" 검색 → API가 "군에서의 형의 집행..." 반환
// → 무조건 성공으로 기록 ❌
// → 다음 "형법" 검색 시 캐시 HIT로 또 잘못된 법령 반환
// → 악순환!
```

**문제 시나리오**:
1. 사용자: "형법 22조" 검색
2. API: "군에서의 형의 집행..." 법령 반환 (첫 번째 결과)
3. 시스템: **무조건 성공으로 학습** → DB 저장
4. 사용자: 부정 피드백 (👎) 3회
5. 시스템: 여전히 **캐시 HIT**로 잘못된 법령 반환
6. **악순환 지속**

### 2. 부정 피드백이 작동하지 않음
- 사용자가 3회 부정 피드백을 줘도 계속 잘못된 법령으로 연결됨
- `search_results` 테이블에는 피드백 점수 필드가 없음
- 학습 데이터를 업데이트하는 메커니즘 없음

### 3. 정확도 검증 없이 저장
- API 응답이 사용자 의도와 맞는지 검증 안 함
- 법령명 유사도 체크 없음
- 조문 존재 여부 체크 없음

---

## ✅ 개선 방안

### 방안 1: 사용자 피드백 기반 학습 (즉시 적용 가능) ⭐ **추천**

#### 개념
- 검색 결과를 **임시로** 저장 (확정되지 않은 상태)
- 사용자 행동으로 신뢰도 점수 계산
- 신뢰도가 높은 결과만 캐시로 사용

#### 구현 단계

**Step 1: search_results 테이블에 신뢰도 점수 추가**
```sql
-- db-local.ts 또는 auto-migrate.ts
ALTER TABLE search_results ADD COLUMN confidence_score INTEGER DEFAULT 0;
ALTER TABLE search_results ADD COLUMN positive_feedback INTEGER DEFAULT 0;
ALTER TABLE search_results ADD COLUMN negative_feedback INTEGER DEFAULT 0;
ALTER TABLE search_results ADD COLUMN is_verified BOOLEAN DEFAULT 0;
```

**Step 2: 신뢰도 점수 계산 로직**
```typescript
// lib/search-confidence.ts (새 파일)

export function calculateConfidenceScore(params: {
  positiveFeedback: number
  negativeFeedback: number
  autoVerified: boolean // 자동 검증 통과 여부
  daysSinceCreated: number
}): number {
  const { positiveFeedback, negativeFeedback, autoVerified, daysSinceCreated } = params

  let score = 0

  // 기본 점수: 자동 검증 통과 시 +30
  if (autoVerified) score += 30

  // 긍정 피드백: +20/회 (최대 60)
  score += Math.min(positiveFeedback * 20, 60)

  // 부정 피드백: -30/회 (치명적)
  score -= negativeFeedback * 30

  // 시간 가중치: 최근일수록 신뢰도 높음
  if (daysSinceCreated <= 7) score += 10 // 1주일 이내
  else if (daysSinceCreated <= 30) score += 5 // 1개월 이내

  return Math.max(score, -100) // 최소 -100
}

// 신뢰도 임계값
export const CONFIDENCE_THRESHOLD = {
  HIGH: 50, // 매우 신뢰할 수 있음
  MEDIUM: 20, // 사용 가능
  LOW: 0, // 주의 필요
  VERY_LOW: -20, // 사용 금지
}
```

**Step 3: 자동 검증 로직**
```typescript
// lib/search-auto-verify.ts (새 파일)

/**
 * 검색 결과가 사용자 의도와 일치하는지 자동 검증
 */
export function autoVerifySearchResult(params: {
  userQuery: string
  parsedLawName: string
  resultLawTitle: string
  requestedJo?: string
  resultArticles: LawArticle[]
}): { verified: boolean; reason: string } {
  const { userQuery, parsedLawName, resultLawTitle, requestedJo, resultArticles } = params

  // 1. 법령명 정확도 체크 (레벤슈타인 거리)
  const lawNameSimilarity = calculateSimilarity(
    parsedLawName.replace(/\s+/g, ''),
    resultLawTitle.replace(/\s+/g, ''),
  )

  if (lawNameSimilarity < 0.6) {
    return {
      verified: false,
      reason: `법령명 불일치 (유사도: ${(lawNameSimilarity * 100).toFixed(0)}%)`,
    }
  }

  // 2. 조문 존재 여부 체크
  if (requestedJo) {
    const articleExists = resultArticles.some((a) => a.jo === requestedJo)
    if (!articleExists) {
      return {
        verified: false,
        reason: `요청한 조문 없음 (jo: ${requestedJo})`,
      }
    }
  }

  // 3. 법령 타입 체크 (시행령, 시행규칙 제외)
  if (
    !userQuery.includes('시행령') &&
    !userQuery.includes('시행규칙') &&
    (resultLawTitle.includes('시행령') || resultLawTitle.includes('시행규칙'))
  ) {
    return {
      verified: false,
      reason: '시행령/시행규칙 제외 필요',
    }
  }

  return {
    verified: true,
    reason: '자동 검증 통과',
  }
}

function calculateSimilarity(a: string, b: string): number {
  // 레벤슈타인 거리 기반 유사도 계산
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) return 1.0

  // 정확히 일치
  if (a === b) return 1.0

  // startsWith 매칭
  if (longer.startsWith(shorter)) return 0.8

  // contains 매칭
  if (longer.includes(shorter)) return 0.6

  // 레벤슈타인 거리 계산
  const distance = levenshteinDistance(a, b)
  return (longer.length - distance) / longer.length
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}
```

**Step 4: 학습 로직 수정**
```typescript
// lib/search-learning.ts 수정

export async function learnFromSuccessfulSearch(params: {
  rawQuery: string
  normalizedQuery: string
  pattern: string
  parsed: ReturnType<typeof parseSearchQuery>
  apiResult: any
  articles: LawArticle[] // ⭐ 새로 추가
  sessionId?: string
}): Promise<{ queryId: number; resultId: number }> {
  const { rawQuery, normalizedQuery, pattern, parsed, apiResult, articles, sessionId } = params

  // 자동 검증
  const verification = autoVerifySearchResult({
    userQuery: rawQuery,
    parsedLawName: parsed.lawName,
    resultLawTitle: apiResult.lawTitle,
    requestedJo: parsed.jo,
    resultArticles: articles,
  })

  console.log(`🔍 자동 검증: ${verification.verified ? '✅ 통과' : '❌ 실패'} - ${verification.reason}`)

  // 검색 결과 저장 (신뢰도 포함)
  const resultId = await recordSearchResult({
    queryId,
    lawId: apiResult.lawId,
    lawTitle: apiResult.lawTitle,
    // ... (기존 필드)
    isVerified: verification.verified ? 1 : 0,
    confidenceScore: verification.verified ? 30 : 0, // 자동 검증 통과 시 기본 30점
  })

  // ⚠️ 자동 검증 실패 시 경고 로그
  if (!verification.verified) {
    console.warn(`⚠️ 검증 실패한 결과 저장됨 (resultId: ${resultId}): ${verification.reason}`)
  }

  return { queryId, resultId }
}
```

**Step 5: 캐시 조회 로직 수정**
```typescript
// lib/search-strategy.ts 수정

async function checkQualityCache(pattern: string): Promise<any | null> {
  const cached = await getHighQualityCache(pattern)

  if (!cached) return null

  // ⭐ 신뢰도 체크
  const confidence = calculateConfidenceScore({
    positiveFeedback: cached.positive_feedback || 0,
    negativeFeedback: cached.negative_feedback || 0,
    autoVerified: cached.is_verified === 1,
    daysSinceCreated: daysSince(cached.created_at),
  })

  console.log(`📊 [L3 캐시] 신뢰도 점수: ${confidence} (임계값: ${CONFIDENCE_THRESHOLD.MEDIUM})`)

  // 신뢰도가 낮으면 캐시 무시
  if (confidence < CONFIDENCE_THRESHOLD.MEDIUM) {
    console.warn(`⚠️ [L3 캐시] 신뢰도 부족으로 무시 (score: ${confidence})`)
    return null
  }

  return cached
}
```

**Step 6: 피드백 처리 로직 수정**
```typescript
// lib/search-feedback-db.ts 수정

export async function handleUserFeedback(params: {
  resultId: number
  isPositive: boolean
  reason?: string
}): Promise<void> {
  const { resultId, isPositive, reason } = params

  const db = getDb()

  // 피드백 카운트 업데이트
  const field = isPositive ? 'positive_feedback' : 'negative_feedback'

  await db.execute({
    sql: `
      UPDATE search_results
      SET ${field} = ${field} + 1,
          confidence_score = ?
      WHERE id = ?
    `,
    args: [
      // 신뢰도 재계산 (서브쿼리)
      // ... (생략)
      resultId,
    ],
  })

  // ⚠️ 부정 피드백이 많으면 자동으로 삭제 (신뢰도 < -20)
  const result = await db.execute({
    sql: 'SELECT confidence_score FROM search_results WHERE id = ?',
    args: [resultId],
  })

  const score = result.rows[0]?.confidence_score || 0
  if (score < CONFIDENCE_THRESHOLD.VERY_LOW) {
    console.warn(`🗑️ 신뢰도 매우 낮음 (${score}), 자동 삭제: resultId=${resultId}`)

    await db.execute({
      sql: 'DELETE FROM search_results WHERE id = ?',
      args: [resultId],
    })
  }

  console.log(`✅ 피드백 처리 완료: resultId=${resultId}, isPositive=${isPositive}`)
}
```

---

### 방안 2: 법령명 유사도 필터링 (즉시 적용 가능)

#### app/page.tsx의 법령 검색 로직 수정

```typescript
// app/page.tsx:854-889 수정

const normalizedLawName = lawName.replace(/\s+/g, "")

console.log(`🔍 [법령 검색] 검색어: "${lawName}", 결과: ${results.length}개`)
console.log(`   결과 목록:`, results.slice(0, 5).map(r => r.lawName).join(', '))

// 1. 정확히 일치하는 법령 찾기
let exactMatch = results.find((r) => r.lawName.replace(/\s+/g, "") === normalizedLawName)
console.log(`   정확 매칭: ${exactMatch ? exactMatch.lawName : '없음'}`)

// 2. 유사도 기반 매칭 (정확한 매칭이 없을 때만)
if (!exactMatch && normalizedLawName.length > 2) {
  // 모든 결과에 대해 유사도 계산
  const scoredResults = results.map((r) => {
    const similarity = calculateSimilarity(
      normalizedLawName,
      r.lawName.replace(/\s+/g, "")
    )
    return { result: r, similarity }
  })

  // 유사도 높은 순으로 정렬
  scoredResults.sort((a, b) => b.similarity - a.similarity)

  console.log(`   유사도 매칭:`, scoredResults.slice(0, 3).map(s =>
    `${s.result.lawName} (${(s.similarity * 100).toFixed(0)}%)`
  ).join(', '))

  // 유사도가 60% 이상이고, 시행령/시행규칙이 아니면 선택
  const bestMatch = scoredResults.find((s) =>
    s.similarity >= 0.6 &&
    !s.result.lawName.includes("시행령") &&
    !s.result.lawName.includes("시행규칙")
  )

  if (bestMatch) {
    exactMatch = bestMatch.result
    console.log(`   최종 선택: ${exactMatch.lawName} (유사도: ${(bestMatch.similarity * 100).toFixed(0)}%)`)
  }
}

// 3. 매칭 실패 시 사용자에게 선택하도록 제안
if (!exactMatch && results.length > 0) {
  console.warn(`⚠️ [법령 검색] "${lawName}"의 정확한 매칭 실패, 사용자 선택 필요`)

  // 여러 결과 중 선택하도록 UI 표시
  setLawSelectionState({
    results: results,
    query: query,
  })
  setIsSearching(false)
  return
}
```

---

### 방안 3: 학습 데이터 정기 검증 (백그라운드 작업)

#### 개념
- 주기적으로 신뢰도 낮은 데이터 자동 정리
- 부정 피드백 많은 데이터 삭제
- 오래된 데이터 재검증

#### 구현
```typescript
// lib/learning-maintenance.ts (새 파일)

export async function performMaintenance(): Promise<void> {
  console.log('🔧 학습 데이터 유지보수 시작...')

  const db = getDb()

  // 1. 부정 피드백 많은 데이터 삭제
  const deleteResult = await db.execute(`
    DELETE FROM search_results
    WHERE negative_feedback >= 3
      AND (positive_feedback = 0 OR negative_feedback > positive_feedback * 2)
  `)
  console.log(`🗑️ 부정 피드백 많은 데이터 삭제: ${deleteResult.rowsAffected}개`)

  // 2. 30일 이상 사용되지 않은 미검증 데이터 삭제
  const cleanupResult = await db.execute(`
    DELETE FROM search_results
    WHERE is_verified = 0
      AND datetime(created_at) < datetime('now', '-30 days')
  `)
  console.log(`🗑️ 오래된 미검증 데이터 삭제: ${cleanupResult.rowsAffected}개`)

  // 3. Orphan 쿼리 삭제
  const orphanResult = await db.execute(`
    DELETE FROM search_queries
    WHERE id NOT IN (SELECT DISTINCT query_id FROM search_results WHERE query_id IS NOT NULL)
  `)
  console.log(`🗑️ Orphan 쿼리 삭제: ${orphanResult.rowsAffected}개`)

  console.log('✅ 유지보수 완료')
}

// 서버 시작 시 1회 실행
if (typeof window === 'undefined') {
  performMaintenance().catch(console.error)
}
```

---

## 📊 개선 효과 비교

| 항목 | 현재 | 방안 1 적용 후 |
|------|------|----------------|
| 잘못된 법령 학습 | ❌ 무조건 학습 | ✅ 자동 검증 후 학습 |
| 부정 피드백 | ❌ 무시됨 | ✅ 즉시 반영, 자동 삭제 |
| 캐시 신뢰도 | ❌ 없음 | ✅ 점수 기반 필터링 |
| 악순환 방지 | ❌ 없음 | ✅ 신뢰도 낮으면 캐시 무시 |
| 데이터 정리 | ❌ 수동 | ✅ 자동 (유지보수) |

---

## 🚀 적용 우선순위

### 즉시 적용 (High Priority)
1. **방안 2: 법령명 유사도 필터링** ⭐
   - 가장 빠르게 적용 가능
   - 잘못된 법령 선택 즉시 차단
   - 30분 작업

2. **학습 데이터 정리 스크립트 개선**
   - `clear-bad-learning.mjs` 확장
   - 부정 피드백 많은 데이터 자동 삭제
   - 20분 작업

### 단기 적용 (Medium Priority)
3. **방안 1: 신뢰도 점수 시스템**
   - DB 마이그레이션 필요
   - 자동 검증 로직 추가
   - 2-3시간 작업

### 장기 적용 (Low Priority)
4. **방안 3: 정기 유지보수**
   - 백그라운드 작업 스케줄링
   - 모니터링 대시보드
   - 1일 작업

---

## 💡 추가 개선 아이디어

### 1. 사용자 행동 분석
- 체류 시간: 5초 이상 → 긍정 신호
- 즉시 이탈: 3초 이내 → 부정 신호
- 조문 클릭: 긍정 신호
- 검색 재시도: 부정 신호

### 2. A/B 테스트
- 신뢰도 임계값 조정
- 자동 검증 알고리즘 개선
- 최적의 유사도 기준 찾기

### 3. 관리자 대시보드
- 신뢰도 낮은 데이터 목록
- 부정 피드백 많은 검색어
- 자동 검증 실패율
