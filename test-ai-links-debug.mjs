// 정규식 직접 테스트
const text = '수입자는 물품 수입 시 관세법 제38조에 따라'

const wideRegex = /(?<!「)([가-힣a-zA-Z0-9·\s]+(?:법률|법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s+제\s*(\d+)\s*조/g

let match
while ((match = wideRegex.exec(text)) !== null) {
  console.log('Match found:')
  console.log('  Full match:', JSON.stringify(match[0]))
  console.log('  Law name (raw):', JSON.stringify(match[1]))
  console.log('  Article:', match[2])

  // 정제 패턴 테스트
  const rawLawName = match[1].trim()
  const cleanMatch = rawLawName.match(/(?:[가-힣]+의\s+)?(?:[가-힣]+(?:\s+및\s+[가-힣]+)*에\s+관한\s+)?([가-힣a-zA-Z0-9·]+(?:\s+및\s+[가-힣]+)*(?:법률|법|령|규칙|조례))(?:\s+(시행령|시행규칙))?$/)

  console.log('  Clean match:', cleanMatch ? JSON.stringify(cleanMatch[0]) : 'FAIL')

  if (cleanMatch) {
    const lawName = cleanMatch[0].trim()
    const isValid = lawName.length > 2 && !/^[가-힣]{1,2}\s*법$/.test(lawName)
    console.log('  Valid?', isValid, `(length: ${lawName.length})`)
  }
  console.log()
}

console.log('\n=== Test 2: 국토의 계획 ===')
const text2 = '국토의 계획 및 이용에 관한 법률 시행령 제61조'

wideRegex.lastIndex = 0
while ((match = wideRegex.exec(text2)) !== null) {
  console.log('Match found:')
  console.log('  Full match:', JSON.stringify(match[0]))
  console.log('  Law name (raw):', JSON.stringify(match[1]))

  const rawLawName = match[1].trim()
  const cleanMatch = rawLawName.match(/(?:[가-힣]+의\s+)?(?:[가-힣]+(?:\s+및\s+[가-힣]+)*에\s+관한\s+)?([가-힣a-zA-Z0-9·]+(?:\s+및\s+[가-힣]+)*(?:법률|법|령|규칙|조례))(?:\s+(시행령|시행규칙))?$/)

  console.log('  Clean match:', cleanMatch ? JSON.stringify(cleanMatch[0]) : 'FAIL')

  if (cleanMatch) {
    const lawName = cleanMatch[0].trim()
    const isValid = lawName.length > 2 && !/^[가-힣]{1,2}\s*법$/.test(lawName)
    console.log('  Valid?', isValid, `(length: ${lawName.length})`)
  }
  console.log()
}
