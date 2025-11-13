#!/usr/bin/env node
/**
 * Check 관세법 제38조 original data from law.go.kr API
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const LAW_OC = process.env.LAW_OC

async function checkArticle38() {
  console.log('\n📋 관세법 제38조 원본 데이터 확인\n')

  // 관세법 ID = 011998 (from law-ids-mapping.json)
  const url = `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${LAW_OC}&type=JSON&ID=011998`

  console.log('API URL:', url)
  console.log()

  const response = await fetch(url)
  const data = await response.json()

  // DEBUG: Show full structure
  console.log('API Response keys:', Object.keys(data))
  console.log('Full response sample:', JSON.stringify(data, null, 2).substring(0, 500))
  console.log()

  const law = data.법령
  if (!law) {
    console.log('❌ API 응답에서 법령 데이터를 찾을 수 없습니다')
    console.log('Response:', JSON.stringify(data, null, 2))
    return
  }

  console.log('법령명:', law.법령명_한글)
  console.log('시행일자:', law.시행일자)
  console.log()

  // Find 제38조
  const articles = Array.isArray(law.조문?.조문단위)
    ? law.조문.조문단위
    : [law.조문?.조문단위]

  const article38 = articles.find(a => a.조문번호 === '38')

  if (!article38) {
    console.log('❌ 제38조를 찾을 수 없습니다')
    return
  }

  console.log('='.repeat(100))
  console.log('제38조 정보:')
  console.log('='.repeat(100))
  console.log()
  console.log('조문번호:', article38.조문번호)
  console.log('조문제목:', article38.조문제목)
  console.log()
  console.log('조문내용 (전체):')
  console.log('-'.repeat(100))
  console.log(article38.조문내용)
  console.log('-'.repeat(100))
  console.log()
  console.log('조문내용 길이:', article38.조문내용.length, 'chars')

  // Count 항
  const hangMatches = article38.조문내용.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g)
  if (hangMatches) {
    console.log('항 개수 (①②③ 기호):', hangMatches.length)
    console.log('항 목록:', hangMatches.join(', '))
  }

  // Check for numbered items
  const numberedItems = article38.조문내용.match(/^\d+\.\s/gm)
  if (numberedItems) {
    console.log('번호 항목 (1. 형태):', numberedItems.length)
  }

  console.log()
  console.log('='.repeat(100))
  console.log('마크다운 변환 형식:')
  console.log('='.repeat(100))
  console.log()
  console.log(`## 제${article38.조문번호}조${article38.조문제목 ? ` ${article38.조문제목}` : ''}`)
  console.log()
  console.log(article38.조문내용)
  console.log()
}

checkArticle38().catch(console.error)
