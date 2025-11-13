#!/usr/bin/env node

/**
 * Search and verify law IDs for all 30 laws
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const API_KEY = process.env.LAW_OC

async function searchLaw(lawName: string): Promise<{ lawId: string; exactName: string } | null> {
  const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${API_KEY}&target=law&type=JSON&query=${encodeURIComponent(
    lawName
  )}`

  const res = await fetch(url)
  const data = await res.json()

  if (!data.LawSearch?.law) {
    return null
  }

  const laws = Array.isArray(data.LawSearch.law) ? data.LawSearch.law : [data.LawSearch.law]

  // Find exact match
  const exactMatch = laws.find((law: any) => law.법령명한글 === lawName)

  if (exactMatch) {
    return {
      lawId: exactMatch.법령ID,
      exactName: exactMatch.법령명한글
    }
  }

  // If no exact match, return first result
  if (laws.length > 0) {
    console.log(`   ⚠️  No exact match, using: ${laws[0].법령명한글}`)
    return {
      lawId: laws[0].법령ID,
      exactName: laws[0].법령명한글
    }
  }

  return null
}

async function main() {
  console.log('🔍 검색 및 법령 ID 확인\n')

  const oldMapping = JSON.parse(fs.readFileSync(path.join(__dirname, 'law-ids-mapping.json'), 'utf-8'))

  const lawNames = Object.keys(oldMapping)
  const newMapping: Record<string, string> = {}

  for (const lawName of lawNames) {
    const oldId = oldMapping[lawName]
    console.log(`\n검색: ${lawName} (기존 ID: ${oldId})`)

    const result = await searchLaw(lawName)

    if (result) {
      console.log(`   ✅ 찾음: ${result.exactName} (ID: ${result.lawId})`)

      if (result.lawId !== oldId) {
        console.log(`   ⚠️  ID 불일치! 기존: ${oldId}, 신규: ${result.lawId}`)
      }

      newMapping[lawName] = result.lawId
    } else {
      console.log(`   ❌ 찾지 못함`)
      newMapping[lawName] = oldId // Keep old ID
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  // Save new mapping
  fs.writeFileSync(
    path.join(__dirname, 'law-ids-mapping-verified.json'),
    JSON.stringify(newMapping, null, 2),
    'utf-8'
  )

  console.log('\n✅ 검증 완료!')
  console.log(`저장: law-ids-mapping-verified.json`)
}

main().catch((error) => {
  console.error('\n❌ Error:', error)
  process.exit(1)
})
