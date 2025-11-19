const text = '도로법 시행령 제55조'

const regex = /(?<!「)([가-힣a-zA-Z0-9·]{2,20}(?:법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s+제\s*(\d+)\s*조/

const match = text.match(regex)

console.log('입력:', text)
console.log('매칭:', match ? match[1] : 'null')
console.log('전체:', match ? match[0] : 'null')
