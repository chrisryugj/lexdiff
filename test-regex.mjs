const text = "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률 제1조 ([목적])"

// 제목 부분도 포함해서 매칭
const pattern = /([가-힣a-zA-Z0-9·\s]+(?:법률|법|령|규칙|조례))\s+제(\d+)조(의(\d+))?\s*(\([^\)]*\])?/g

const matches = [...text.matchAll(pattern)]

console.log('입력:', text)
console.log('매칭 결과:', matches.length, '개')
matches.forEach((match, i) => {
  console.log(`\n매칭 ${i + 1}:`)
  console.log('  전체:', match[0])
  console.log('  법령명:', match[1])
  console.log('  조문번호:', match[2])
  console.log('  제목부분:', match[4])

  // 제목 제거 후
  const displayText = match[0].replace(/\s*\([^\)]*\]\s*$/, '')
  console.log('  제목제거:', displayText)
})
