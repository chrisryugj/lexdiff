#!/usr/bin/env node
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

const url = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents?pageSize=100`

const response = await fetch(url, {
  headers: { 'x-goog-api-key': API_KEY }
})

const data = await response.json()
const docs = data.documents || []

console.log('📊 현재 업로드된 문서:', docs.length, '개\n')

if (docs.length > 0) {
  console.log('최근 문서:')
  docs.slice(0, 10).forEach((doc, i) => {
    const metadata = doc.customMetadata || []
    const lawName = metadata.find(m => m.key === 'law_name')?.stringValue || doc.displayName
    console.log(`  ${i+1}. ${lawName} (${doc.state})`)
  })

  if (docs.length > 10) {
    console.log(`  ... 외 ${docs.length - 10}개`)
  }

  console.log('\n→ Admin Dashboard에서 추가 법령을 업로드하세요')
  console.log('→ 또는 기존 문서를 삭제하고 새로 업로드하세요')
} else {
  console.log('→ Store가 비어있습니다. Admin Dashboard에서 법령을 업로드하세요')
}
