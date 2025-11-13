#!/usr/bin/env node
/**
 * Test different law.go.kr API methods to find one that returns full article content
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const LAW_OC = process.env.LAW_OC
const LAW_ID = '001556' // 관세법

async function testMethod(name, url) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`Testing: ${name}`)
  console.log(`URL: ${url}`)
  console.log('='.repeat(80))

  try {
    const res = await fetch(url)
    const text = await res.text()

    // Check if HTML error
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      console.log('❌ HTML error page returned')
      return
    }

    const data = JSON.parse(text)
    const law = data.법령

    if (!law) {
      console.log('❌ No 법령 in response')
      return
    }

    console.log('법령명:', law.법령명_한글)

    const articles = Array.isArray(law.조문?.조문단위) ? law.조문.조문단위 : [law.조문?.조문단위]
    const a38 = articles.find(a => a.조문번호 === '38' && a.조문제목?.includes('신고'))

    if (!a38) {
      console.log('❌ 제38조 신고납부 not found')
      return
    }

    let content = a38.조문내용
    if (Array.isArray(content)) {
      content = content.join('\n')
    }

    console.log('\n✅ Found 제38조 신고납부')
    console.log('Content length:', content.length, 'chars')
    console.log('\nFirst 500 chars:')
    console.log(content.substring(0, 500))
    console.log('...')

    const hangs = content.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g)
    if (hangs) {
      console.log('\n항 개수:', hangs.length)
      console.log('항 목록:', hangs.join(', '))
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
  }
}

// Test different API methods
await testMethod(
  'Method 1: eflaw (현행법령)',
  `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${LAW_OC}&type=JSON&ID=${LAW_ID}`
)

await testMethod(
  'Method 2: law (법령)',
  `https://www.law.go.kr/DRF/lawService.do?target=law&OC=${LAW_OC}&type=JSON&ID=${LAW_ID}`
)

await testMethod(
  'Method 3: eflaw with MST',
  `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${LAW_OC}&type=JSON&MST=010156`
)

console.log('\n\n' + '='.repeat(80))
console.log('Testing complete')
console.log('='.repeat(80))
