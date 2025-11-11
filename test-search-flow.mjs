#!/usr/bin/env node
/**
 * 검색 흐름 테스트 스크립트
 * Phase 5/6의 모든 레이어(L0~L4)를 순차적으로 테스트
 */

import 'dotenv/config'

console.log('🧪 검색 흐름 테스트 시작\n')

// 테스트 케이스
const testCases = [
  { query: '관세법 제38조', expected: 'L1 또는 L3', description: '정상 검색어 (캐시됨)' },
  { query: '관셰법 38조', expected: 'L1 정규화 또는 L0 벡터', description: '오타 검색어 (셰→세)' },
  { query: '완전히틀린검색어', expected: 'L4 API 실패', description: '잘못된 검색어' },
]

// 동적 import로 서버 모듈 로드
async function testSearchFlow() {
  try {
    console.log('📦 모듈 로딩 중...\n')

    // 검색 전략 모듈
    const { intelligentSearch } = await import('./lib/search-strategy.ts')

    for (const testCase of testCases) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`🔍 테스트: ${testCase.description}`)
      console.log(`   입력: "${testCase.query}"`)
      console.log(`   기대: ${testCase.expected}`)
      console.log('='.repeat(60))

      const startTime = performance.now()

      try {
        const result = await intelligentSearch(testCase.query)
        const elapsed = Math.round(performance.now() - startTime)

        console.log(`\n✅ 검색 성공 (${elapsed}ms)`)
        console.log(`   법령명: ${result.lawTitle}`)
        console.log(`   법령 ID: ${result.lawId}`)
        console.log(`   시행일: ${result.effectiveDate}`)
        console.log(`   조항: ${result.article || 'N/A'}`)
        console.log(`   캐시 레이어: ${result.cacheLayer}`)
        console.log(`   캐시 키: ${result.cacheKey}`)

      } catch (error) {
        const elapsed = Math.round(performance.now() - startTime)
        console.log(`\n❌ 검색 실패 (${elapsed}ms)`)
        console.log(`   에러: ${error.message}`)

        // 유사 검색어 제안이 있는지 확인
        if (error.message.includes('혹시 이것을 찾으셨나요')) {
          console.log('   💡 벡터 검색 제안 포함됨')
        }
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('🧪 테스트 완료')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ 테스트 실패:', error)
    process.exit(1)
  }
}

// 테스트 실행
testSearchFlow()
