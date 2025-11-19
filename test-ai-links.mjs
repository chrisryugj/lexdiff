import { linkifyRefsAI } from './lib/unified-link-generator.ts'

console.log('=== AI 링크 생성 테스트 (이스케이프된 텍스트) ===\n')

// 테스트 케이스 1: 이스케이프된 텍스트
const escapedText = '수입자는 물품 수입 시 관세법 제38조에 따라 정확한 납세신고를 해야 합니다.'

console.log('입력 (이스케이프됨):', escapedText)

const result = linkifyRefsAI(escapedText)
console.log('\n결과:')
console.log(result)

// 검증
const hasProperLink = result.includes('<a href="#" class="law-ref"')
const hasCorrectDataLaw = result.includes('data-law="관세법"')
const hasCorrectDataArticle = result.includes('data-article="제38조"')
const noEscapedTags = !result.includes('&lt;a href')

console.log('\n검증:')
console.log('✓ 링크 태그 생성:', hasProperLink ? '✅' : '❌')
console.log('✓ data-law 정확:', hasCorrectDataLaw ? '✅' : '❌')
console.log('✓ data-article 정확:', hasCorrectDataArticle ? '✅' : '❌')
console.log('✓ 이스케이프 안 됨:', noEscapedTags ? '✅' : '❌')

// 테스트 케이스 2: 여러 법령
const multiText = '「건축법」 제2조와 국토의 계획 및 이용에 관한 법률 시행령 제61조를 참조하세요.'

console.log('\n\n=== 복합 법령 테스트 ===')
console.log('입력:', multiText)

const multiResult = linkifyRefsAI(multiText)
console.log('\n결과:')
console.log(multiResult)

// 링크 개수 확인
const linkCount = (multiResult.match(/class="law-ref"/g) || []).length
console.log('\n✓ 생성된 링크 개수:', linkCount, linkCount === 2 ? '✅' : '❌')
