import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const LAW_OC = process.env.LAW_OC
const url = `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${LAW_OC}&type=JSON&ID=001556`

console.log('\n📋 관세법 제38조 원본 데이터\n')

const response = await fetch(url)
const data = await response.json()

const law = data.법령
console.log('법령명:', law.법령명_한글)
console.log('시행일자:', law.시행일자)
console.log()

const articles = Array.isArray(law.조문?.조문단위) ? law.조문.조문단위 : [law.조문?.조문단위]

console.log('총 조문 수:', articles.length)
console.log()

// Show articles around 38
const around38 = articles.filter(a => {
  const num = parseInt(a.조문번호)
  return num >= 35 && num <= 42
})

console.log('제35조~42조 목록:')
around38.forEach(a => {
  const contentType = typeof a.조문내용
  const contentLength = Array.isArray(a.조문내용)
    ? a.조문내용.join('').length
    : (typeof a.조문내용 === 'string' ? a.조문내용.length : 0)
  console.log(`  제${a.조문번호}조 ${a.조문제목 || '(제목없음)'} - 내용 길이: ${contentLength}`)
})
console.log()

// Find "신고납부" article
const a38_singonapbu = articles.find(a => a.조문번호 === '38' && a.조문제목?.includes('신고납부'))

console.log('='.repeat(100))
console.log('제38조 신고납부 전체 내용:')
console.log('='.repeat(100))
console.log()

if (a38_singonapbu) {
  let content = a38_singonapbu.조문내용
  if (Array.isArray(content)) {
    content = content.join('\n')
  }
  console.log(content)
  console.log()
  console.log('길이:', content.length, 'chars')
  const hangs = content.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g)
  if (hangs) {
    console.log('항 개수:', hangs.length, '개')
    console.log('항 목록:', hangs.join(', '))
  }
} else {
  console.log('❌ 제38조 신고납부를 찾을 수 없습니다')
}
console.log()

const a38 = articles.find(a => a.조문번호 === '38')

if (a38) {
  console.log('='.repeat(100))
  console.log('제38조:', a38.조문제목)
  console.log('='.repeat(100))
  console.log()
  console.log('조문내용 타입:', typeof a38.조문내용)
  console.log('조문내용 isArray:', Array.isArray(a38.조문내용))
  console.log()

  let content = a38.조문내용
  if (Array.isArray(content)) {
    console.log('배열 길이:', content.length)
    content = content.join('\n')
  } else if (typeof content === 'object') {
    console.log('객체입니다:', JSON.stringify(content, null, 2))
    content = JSON.stringify(content)
  }

  console.log('조문내용 문자열 길이:', content.length, 'chars')
  console.log()

  const hangs = content.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g)
  if (hangs) {
    console.log('항 개수 (①②③ 기호):', hangs.length)
    console.log('항 목록:', hangs.join(', '))
  }
  console.log()
  console.log('='.repeat(100))
  console.log('전체 조문 내용:')
  console.log('='.repeat(100))
  console.log()
  console.log(content)
  console.log()
} else {
  console.log('❌ 제38조를 찾을 수 없습니다')
  console.log('Available articles:', articles.map(a => `제${a.조문번호}조`).slice(0, 10))
}
