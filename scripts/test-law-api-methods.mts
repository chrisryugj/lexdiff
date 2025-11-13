#!/usr/bin/env node

/**
 * Test Law API Methods
 * Tests different ways to fetch 관세법 and check response structure
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const API_KEY = process.env.LAW_OC

if (!API_KEY) {
  console.error('❌ LAW_OC API 키가 설정되지 않았습니다')
  process.exit(1)
}

async function testMethod1() {
  console.log('\n=== Method 1: MST=001556 (from mapping) ===')
  const url = `https://www.law.go.kr/DRF/lawService.do?OC=${API_KEY}&target=law&type=JSON&MST=001556`
  const res = await fetch(url)
  const data = await res.json()

  console.log('법령명:', data.법령?.법령명_한글 || data.법령?.법령명한글 || 'Not found')
  console.log('법령ID:', data.법령?.법령일련번호 || 'Not found')
  console.log('\nResponse keys:', Object.keys(data))
  if (data.법령) {
    console.log('법령 keys:', Object.keys(data.법령))
  }

  fs.writeFileSync(
    path.join(__dirname, 'test-method1-response.json'),
    JSON.stringify(data, null, 2),
    'utf-8'
  )
  console.log('✅ Saved to: test-method1-response.json')
}

async function testMethod2() {
  console.log('\n=== Method 2: Search for 관세법 ===')
  const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${API_KEY}&target=law&type=JSON&query=관세법`
  const searchRes = await fetch(searchUrl)
  const searchData = await searchRes.json()

  console.log('Search results:', searchData.LawSearch?.law?.length || 0)

  if (searchData.LawSearch?.law) {
    const laws = Array.isArray(searchData.LawSearch.law)
      ? searchData.LawSearch.law
      : [searchData.LawSearch.law]

    console.log('\nFirst 3 results:')
    laws.slice(0, 3).forEach((law: any, i: number) => {
      console.log(`${i + 1}. ${law.법령명한글} (ID: ${law.법령ID})`)
    })

    // Find exact match
    const exactMatch = laws.find((law: any) => law.법령명한글 === '관세법')
    if (exactMatch) {
      console.log('\n✅ Found exact match:')
      console.log('법령명:', exactMatch.법령명한글)
      console.log('법령ID:', exactMatch.법령ID)

      // Now fetch with this ID
      console.log('\n=== Fetching with correct ID ===')
      const contentUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${API_KEY}&target=law&type=JSON&MST=${exactMatch.법령ID}`
      const contentRes = await fetch(contentUrl)
      const contentData = await contentRes.json()

      console.log('법령명:', contentData.법령?.법령명_한글 || contentData.법령?.법령명한글 || 'Not found')

      fs.writeFileSync(
        path.join(__dirname, 'test-method2-response.json'),
        JSON.stringify(contentData, null, 2),
        'utf-8'
      )
      console.log('✅ Saved to: test-method2-response.json')
    }
  }
}

async function main() {
  console.log('🔍 Testing Law API Methods\n')

  await testMethod1()
  await testMethod2()

  console.log('\n✅ Test complete!')
  console.log('Check test-method*.json files for full responses')
}

main().catch((error) => {
  console.error('\n❌ Error:', error)
  process.exit(1)
})
