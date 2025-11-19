import { generateLinks, linkifyRefsB, linkifyRefsAI } from './lib/unified-link-generator.ts'

console.log('=== 통합 링크 생성 테스트 ===\n')

// 테스트 케이스들
const testCases = [
  {
    name: '꺽쇄 + 조문 + 항/호',
    input: '「국토의 계획 및 이용에 관한 법률 시행령」 제61조제1호',
    expected: 'data-law="국토의 계획 및 이용에 관한 법률 시행령" data-article="제61조"'
  },
  {
    name: '꺽쇄 법령 내부의 다른 법령 참조',
    input: '「건축법」 제2조제1항제2호에 따른 건축물로서 국토의 계획 및 이용에 관한 법률 시행령 제61조',
    expectedCount: 2  // 두 개의 링크가 생성되어야 함
  },
  {
    name: '같은 법 패턴',
    input: '「도로법」 제61조에 따라 설치하고, 같은 법 제55조에 의한 허가',
    expectedSameLaw: true
  },
  {
    name: '대통령령으로 정하는',
    input: '세부사항은 대통령령으로 정하는 바에 따른다',
    expectedDecree: true
  },
  {
    name: '중복 방지 테스트',
    input: '5. 지하상가ㆍ지하실(「건축법」 제2조제1항제2호에 따른 건축물로서 「국토의 계획 및 이용에 관한 법률 시행령」 제61조제1호에 따라 설치하는 경우만 해당한다)',
    expectedNoDuplicate: true
  }
]

// 각 테스트 실행
testCases.forEach((test, index) => {
  console.log(`\n테스트 ${index + 1}: ${test.name}`)
  console.log('입력:', test.input)

  // Safe 모드 테스트
  const safeResult = generateLinks(test.input, {
    mode: 'safe',
    enableSameRef: true,
    enableAdminRules: true
  })

  console.log('Safe 모드 결과:')
  console.log(safeResult)

  // Aggressive 모드 테스트
  const aggressiveResult = generateLinks(test.input, {
    mode: 'aggressive',
    enableSameRef: false,
    enableAdminRules: false
  })

  console.log('Aggressive 모드 결과:')
  console.log(aggressiveResult)

  // 검증
  if (test.expected) {
    if (safeResult.includes(test.expected)) {
      console.log('✅ 예상 결과 포함됨')
    } else {
      console.log('❌ 예상 결과 누락:', test.expected)
    }
  }

  if (test.expectedCount) {
    const linkCount = (safeResult.match(/class="law-ref"/g) || []).length
    if (linkCount === test.expectedCount) {
      console.log(`✅ 링크 개수 일치: ${linkCount}`)
    } else {
      console.log(`❌ 링크 개수 불일치: ${linkCount} (예상: ${test.expectedCount})`)
    }
  }

  if (test.expectedSameLaw) {
    if (safeResult.includes('같은 법')) {
      console.log('✅ "같은 법" 패턴 처리됨')
    } else {
      console.log('❌ "같은 법" 패턴 미처리')
    }
  }

  if (test.expectedDecree) {
    if (safeResult.includes('data-kind="decree"')) {
      console.log('✅ 대통령령 링크 생성됨')
    } else {
      console.log('❌ 대통령령 링크 미생성')
    }
  }

  if (test.expectedNoDuplicate) {
    // HTML 태그 안의 텍스트가 다시 링크되지 않았는지 확인
    const hasNestedLink = safeResult.includes('data-article="토의 계획')
    if (!hasNestedLink) {
      console.log('✅ 중복 링크 없음')
    } else {
      console.log('❌ 중복 링크 발견')
    }
  }
})

// 실제 문제 케이스 테스트
console.log('\n\n=== 실제 문제 케이스 테스트 ===')

const problemCase = `5. 지하상가ㆍ지하실(「건축법」 제2조제1항제2호에 따른 건축물로서 「국토의 계획 및 이용에 관한 법률 시행령」 제61조제1호에 따라 설치하는 경우만 해당한다)ㆍ통로ㆍ육교, 그 밖에 이와 유사한 것`

console.log('문제 케이스:', problemCase)
const result = linkifyRefsB(problemCase)
console.log('\n처리 결과:', result)

// data-article 속성 검사
const articleMatches = result.match(/data-article="[^"]+"/g) || []
console.log('\n발견된 data-article 속성들:')
articleMatches.forEach(m => console.log(' - ' + m))

// 중복 확인
const hasError = articleMatches.some(m => m.includes('법령') || m.includes('법률'))
if (hasError) {
  console.log('\n❌ 오류: data-article에 법령명이 포함됨!')
} else {
  console.log('\n✅ 정상: data-article에 조문 번호만 포함됨')
}