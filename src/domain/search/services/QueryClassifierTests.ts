/**
 * QueryClassifierTests - 통합 쿼리 분류기 테스트
 */

import { classifySearchQuery } from './QueryClassifier'

interface TestCase {
  query: string
  expected: {
    searchType?: string
    confidence?: number
    legalQueryType?: string
    caseNumber?: string
    court?: string
    ruleType?: string
    rulingNumber?: string
    lawName?: string
    isCompound?: boolean
  }
}

const TEST_CASES: TestCase[] = [
  // 1. 법령 검색
  {
    query: '민법 제38조',
    expected: { searchType: 'law', confidence: 0.98, legalQueryType: 'definition' }
  },
  // 2. 조례 검색
  {
    query: '서울특별시 주차장 조례',
    expected: { searchType: 'ordinance', confidence: 0.95 }
  },
  // 3. 판례 검색
  {
    query: '대법원 2023도1234',
    expected: { searchType: 'precedent', confidence: 0.99, caseNumber: '2023도1234', court: '대법원' }
  },
  // 4. 해석례 검색
  {
    query: '관세법 예규',
    expected: { searchType: 'interpretation', confidence: 0.95, ruleType: '예규' }
  },
  // 5. 재결례 검색
  {
    query: '조심2023서0001',
    expected: { searchType: 'ruling', confidence: 0.98, rulingNumber: '조심2023서0001' }
  },
  // 6. AI 질문 (requirement)
  {
    query: '면제 요건은?',
    expected: { searchType: 'ai', legalQueryType: 'requirement' }
  },
  // 7. AI 질문 (exemption)
  {
    query: '면제 대상은?',
    expected: { searchType: 'ai', legalQueryType: 'exemption' }
  },
  // 8. 복합 쿼리
  {
    query: '민법 제38조 관련 판례',
    expected: { searchType: 'multi', isCompound: true }
  },
  // 9. 긴 법령명
  {
    query: '자유무역협정의 이행을 위한 관세법의 특례에 관한 법률',
    expected: { searchType: 'law', confidence: 0.95 }
  },
  // 10. 띄어쓰기 없는 법령명
  {
    query: '관세법시행령',
    expected: { searchType: 'law', lawName: '관세법 시행령' }
  }
]

/**
 * 테스트 실행 함수
 */
export function runTests(): void {
  console.log('=== 통합 쿼리 분류기 테스트 ===\n')

  let passedCount = 0
  let failedCount = 0

  TEST_CASES.forEach((test, index) => {
    const result = classifySearchQuery(test.query)

    let passed = true
    const errors: string[] = []

    // searchType 검증
    if (test.expected.searchType && result.searchType !== test.expected.searchType) {
      passed = false
      errors.push(`searchType: expected ${test.expected.searchType}, got ${result.searchType}`)
    }

    // confidence 검증 (±0.05 허용)
    if (test.expected.confidence !== undefined) {
      const diff = Math.abs(result.confidence - test.expected.confidence)
      if (diff > 0.05) {
        passed = false
        errors.push(`confidence: expected ~${test.expected.confidence}, got ${result.confidence}`)
      }
    }

    // legalQueryType 검증
    if (test.expected.legalQueryType && result.legalQueryType !== test.expected.legalQueryType) {
      passed = false
      errors.push(`legalQueryType: expected ${test.expected.legalQueryType}, got ${result.legalQueryType}`)
    }

    // entities 검증
    if (test.expected.caseNumber && result.entities.caseNumber !== test.expected.caseNumber) {
      passed = false
      errors.push(`caseNumber: expected ${test.expected.caseNumber}, got ${result.entities.caseNumber}`)
    }
    if (test.expected.court && result.entities.court !== test.expected.court) {
      passed = false
      errors.push(`court: expected ${test.expected.court}, got ${result.entities.court}`)
    }
    if (test.expected.ruleType && result.entities.ruleType !== test.expected.ruleType) {
      passed = false
      errors.push(`ruleType: expected ${test.expected.ruleType}, got ${result.entities.ruleType}`)
    }
    if (test.expected.rulingNumber && result.entities.rulingNumber !== test.expected.rulingNumber) {
      passed = false
      errors.push(`rulingNumber: expected ${test.expected.rulingNumber}, got ${result.entities.rulingNumber}`)
    }
    if (test.expected.lawName && result.entities.lawName !== test.expected.lawName) {
      passed = false
      errors.push(`lawName: expected ${test.expected.lawName}, got ${result.entities.lawName}`)
    }

    // isCompound 검증
    if (test.expected.isCompound !== undefined && result.isCompound !== test.expected.isCompound) {
      passed = false
      errors.push(`isCompound: expected ${test.expected.isCompound}, got ${result.isCompound}`)
    }

    if (passed) {
      passedCount++
      console.log(`✅ Test ${index + 1}: "${test.query}"`)
    } else {
      failedCount++
      console.log(`❌ Test ${index + 1}: "${test.query}"`)
      errors.forEach(err => console.log(`   - ${err}`))
    }
  })

  console.log(`\n=== 결과: ${passedCount}/${TEST_CASES.length} 통과 (${failedCount} 실패) ===`)
}
