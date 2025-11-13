#!/usr/bin/env node

/**
 * Delete All Store Documents Script
 *
 * Deletes all documents from the File Search Store
 * Handles "Cannot delete non-empty Document" error by using state updates
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('❌ GEMINI_FILE_SEARCH_STORE_ID 또는 GEMINI_API_KEY가 설정되지 않았습니다')
  process.exit(1)
}

interface Document {
  name: string
  displayName: string
  state: string
}

/**
 * List all documents in the store
 */
async function listAllDocuments(): Promise<Document[]> {
  const allDocuments: Document[] = []
  let pageToken: string | undefined = undefined
  let hasMore = true

  while (hasMore) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents?pageSize=20${
      pageToken ? `&pageToken=${pageToken}` : ''
    }`

    const response = await fetch(url, {
      headers: { 'x-goog-api-key': API_KEY }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to list documents: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const documents = data.documents || []
    allDocuments.push(...documents)

    pageToken = data.nextPageToken
    hasMore = !!pageToken
  }

  return allDocuments
}

/**
 * Update document state to INACTIVE
 * This might help with deletion
 */
async function updateDocumentState(documentId: string): Promise<boolean> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${documentId}?updateMask=state`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({
      state: 'STATE_INACTIVE'
    })
  })

  return response.ok
}

/**
 * Delete a document
 */
async function deleteDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${documentId}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-goog-api-key': API_KEY }
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { success: false, error: errorText }
  }

  return { success: true }
}

/**
 * Delete a document with retry logic
 */
async function deleteDocumentWithRetry(doc: Document): Promise<boolean> {
  console.log(`\n🗑️  삭제 시도: ${doc.displayName}`)
  console.log(`   ID: ${doc.name}`)

  // First attempt: Direct deletion
  let result = await deleteDocument(doc.name)

  if (result.success) {
    console.log(`   ✅ 삭제 완료`)
    return true
  }

  // If failed due to non-empty document, try updating state first
  if (result.error?.includes('Cannot delete non-empty Document')) {
    console.log(`   ⚠️  Non-empty document 오류 - 상태 업데이트 시도...`)

    const stateUpdated = await updateDocumentState(doc.name)
    if (stateUpdated) {
      console.log(`   ℹ️  상태 업데이트 완료 - 재삭제 시도...`)

      // Wait a bit before retry
      await new Promise((resolve) => setTimeout(resolve, 1000))

      result = await deleteDocument(doc.name)
      if (result.success) {
        console.log(`   ✅ 삭제 완료`)
        return true
      }
    }
  }

  // If still failed, log the error
  console.log(`   ❌ 삭제 실패: ${result.error}`)
  return false
}

async function main() {
  console.log('🗄️  File Search Store 문서 전체 삭제\n')
  console.log(`Store ID: ${STORE_ID}\n`)

  // List all documents
  console.log('📋 문서 목록 조회 중...')
  const documents = await listAllDocuments()

  if (documents.length === 0) {
    console.log('\n✅ Store가 이미 비어있습니다.')
    return
  }

  console.log(`\n발견된 문서: ${documents.length}개\n`)

  // Confirm deletion
  console.log('⚠️  경고: 모든 문서가 삭제됩니다!')
  console.log('계속하려면 이 스크립트를 실행하세요.\n')

  // Delete all documents
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    console.log(`\n[${i + 1}/${documents.length}]`)

    const success = await deleteDocumentWithRetry(doc)
    if (success) {
      successCount++
    } else {
      failCount++
    }

    // Rate limiting: wait a bit between deletions
    if (i < documents.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 삭제 완료 요약')
  console.log('='.repeat(50))
  console.log(`✅ 성공: ${successCount}개`)
  console.log(`❌ 실패: ${failCount}개`)
  console.log(`📦 총 문서: ${documents.length}개`)

  if (failCount > 0) {
    console.log('\n⚠️  일부 문서 삭제 실패')
    console.log('Google Cloud Console에서 수동 삭제가 필요할 수 있습니다.')
  } else {
    console.log('\n✅ 모든 문서가 성공적으로 삭제되었습니다!')
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
