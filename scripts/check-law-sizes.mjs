#!/usr/bin/env node
/**
 * 법령 데이터 크기 측정 스크립트
 * IndexedDB 용량 계획을 위해 실제 법령 데이터 크기를 확인
 */

import 'dotenv/config'

console.log('📊 법령 데이터 크기 측정\n')

// 테스트할 법령 목록 (작은 법령 ~ 큰 법령)
const testLaws = [
  { name: '관세법', lawId: '001556', description: '중간 크기' },
  { name: '민법', lawId: '000901', description: '매우 큰 법령' },
  { name: '형법', lawId: '000959', description: '큰 법령' },
  { name: '상법', lawId: '000902', description: '큰 법령' },
  { name: '전기통신사업법', lawId: '002604', description: '작은 법령' },
]

async function checkLawSize(lawId, lawName, description) {
  try {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📖 ${lawName} (${description})`)
    console.log('='.repeat(60))

    const LAW_OC = process.env.LAW_OC
    const url = `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${LAW_OC}&type=JSON&ID=${lawId}`

    console.log(`🔍 API 호출 중: lawId=${lawId}`)
    const startTime = performance.now()

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const jsonText = await response.text()
    const elapsed = Math.round(performance.now() - startTime)

    // 크기 측정
    const sizeBytes = new TextEncoder().encode(jsonText).length
    const sizeKB = (sizeBytes / 1024).toFixed(2)
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2)

    // JSON 파싱해서 조문 수 확인
    const jsonData = JSON.parse(jsonText)
    let articleCount = 0

    if (jsonData['법령'] && jsonData['법령']['조문']) {
      const articles = jsonData['법령']['조문']['조문단위']
      if (Array.isArray(articles)) {
        articleCount = articles.length
      } else if (articles) {
        articleCount = 1
      }
    }

    console.log(`\n📊 결과:`)
    console.log(`   조문 수: ${articleCount}개`)
    console.log(`   데이터 크기: ${sizeKB} KB (${sizeMB} MB)`)
    console.log(`   API 응답 시간: ${elapsed}ms`)
    console.log(`   평균 크기/조문: ${(sizeBytes / articleCount / 1024).toFixed(2)} KB`)

    return {
      lawName,
      lawId,
      description,
      articleCount,
      sizeBytes,
      sizeKB: parseFloat(sizeKB),
      sizeMB: parseFloat(sizeMB),
      elapsed,
    }
  } catch (error) {
    console.error(`\n❌ 오류: ${error.message}`)
    return null
  }
}

async function main() {
  const results = []

  for (const law of testLaws) {
    const result = await checkLawSize(law.lawId, law.name, law.description)
    if (result) {
      results.push(result)
    }
    // API 부하 방지를 위해 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log('\n\n' + '='.repeat(60))
  console.log('📊 전체 요약')
  console.log('='.repeat(60))

  const totalSize = results.reduce((sum, r) => sum + r.sizeBytes, 0)
  const avgSize = totalSize / results.length
  const maxSize = Math.max(...results.map(r => r.sizeBytes))
  const minSize = Math.min(...results.map(r => r.sizeBytes))

  console.log(`\n총 ${results.length}개 법령 측정:`)
  console.log(`   총 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`   평균 크기: ${(avgSize / 1024).toFixed(2)} KB`)
  console.log(`   최소 크기: ${(minSize / 1024).toFixed(2)} KB`)
  console.log(`   최대 크기: ${(maxSize / 1024).toFixed(2)} KB`)

  console.log('\n\n📱 IndexedDB 용량 계획:')
  console.log('   브라우저 권장 한계: ~50MB (soft limit)')
  console.log('   브라우저 하드 한계: ~1GB (Chrome/Edge)')
  console.log(`   현재 평균: ${(avgSize / 1024).toFixed(2)} KB/법령`)
  console.log(`   예상 저장 가능: ~${Math.floor(50 * 1024 / (avgSize / 1024))}개 법령 (50MB 기준)`)
  console.log(`   예상 저장 가능: ~${Math.floor(1024 * 1024 / (avgSize / 1024))}개 법령 (1GB 기준)`)

  console.log('\n\n💡 권장 전략:')
  if (maxSize > 2 * 1024 * 1024) {
    console.log('   ⚠️  2MB 이상 법령 감지!')
    console.log('   → 압축 고려 (gzip/deflate)')
    console.log('   → 또는 조문 단위 분할 저장')
  }
  console.log('   ✅ 7일 자동 삭제로 용량 관리')
  console.log('   ✅ 사용자당 평균 10-20개 법령 조회 예상')
  console.log(`   ✅ 예상 사용량: ${(20 * avgSize / 1024 / 1024).toFixed(2)} MB (20개 법령)`)
}

main().catch(console.error)
