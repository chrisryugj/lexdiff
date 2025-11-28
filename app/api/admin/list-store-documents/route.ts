/**
 * List Store Documents API
 * GET /api/admin/list-store-documents
 *
 * Lists all documents in the File Search Store
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID
    const apiKey = process.env.GEMINI_API_KEY

    if (!storeId || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_FILE_SEARCH_STORE_ID 또는 GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    console.log('[List Store Documents API] Fetching documents from store:', storeId)

    // List documents with pagination (increased page size for better performance)
    const allDocuments: any[] = []
    let pageToken: string | undefined = undefined
    let hasMore = true
    let pageCount = 0

    while (hasMore) {
      pageCount++
      // Note: Gemini File Search API max pageSize is 20
      const url = `https://generativelanguage.googleapis.com/v1beta/${storeId}/documents?pageSize=20${pageToken ? `&pageToken=${pageToken}` : ''
        }`

      console.log(`[List Store Documents API] Fetching page ${pageCount}...`)
      console.log(`[List Store Documents API] URL: ${url}`)

      const response = await fetch(url, {
        headers: {
          'x-goog-api-key': apiKey
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[List Store Documents API] ❌ Request failed:', response.status, errorText)
        console.error('[List Store Documents API] ❌ URL:', url)

        let errorMessage = `문서 목록 조회 실패: ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error?.message || errorMessage
        } catch {
          // errorText is not JSON
        }

        return NextResponse.json(
          {
            success: false,
            error: errorMessage,
            details: errorText
          },
          { status: response.status }
        )
      }

      const data = await response.json()
      const documents = data.documents || []

      allDocuments.push(...documents)

      pageToken = data.nextPageToken
      hasMore = !!pageToken
    }

    console.log(`[List Store Documents API] ✅ Found ${allDocuments.length} documents`)

    // Format documents for response
    const formattedDocuments = allDocuments.map((doc) => {
      const metadata = doc.customMetadata || []
      const lawName =
        metadata.find((m: any) => m.key === 'law_name')?.stringValue ||
        metadata.find((m: any) => m.key === 'ordinance_name')?.stringValue ||
        doc.displayName ||
        'Unknown'

      return {
        id: doc.name,
        displayName: doc.displayName,
        lawName,
        state: doc.state,
        createTime: doc.createTime,
        updateTime: doc.updateTime,
        customMetadata: doc.customMetadata // Include metadata for sync
      }
    })

    // ✅ Sync with server-side log
    try {
      const fs = require('fs').promises
      const path = require('path')
      const logPath = path.join(process.cwd(), 'data', 'uploaded-laws-log.json')

      let currentLog: any[] = []
      try {
        const content = await fs.readFile(logPath, 'utf-8')
        currentLog = JSON.parse(content)
      } catch {
        // File doesn't exist or is invalid
      }

      // Filter for laws only
      const lawDocuments = formattedDocuments.filter(doc => {
        const metadata = doc.customMetadata || []
        const lawType = metadata.find((m: any) => m.key === 'law_type')?.stringValue
        return lawType === 'law' || lawType === '법령'
      })

      if (lawDocuments.length > 0) {
        const newEntries = lawDocuments.map(doc => {
          const metadata = doc.customMetadata || []
          const fileName = metadata.find((m: any) => m.key === 'file_name')?.stringValue || doc.displayName
          return {
            fileName,
            lawName: doc.lawName,
            uploadedAt: doc.createTime,
            status: 'success',
            documentId: doc.id
          }
        }).filter(entry => entry.fileName) // Ensure fileName exists

        // Merge: Prefer existing log entries (to keep original upload time if needed), but add missing ones
        // Actually, store sync is "source of truth", so maybe we should trust store?
        // Let's just add missing ones to avoid overwriting custom local data if any.

        const mergedLog = [...currentLog]
        for (const entry of newEntries) {
          const existingIndex = mergedLog.findIndex(e => e.fileName === entry.fileName)
          if (existingIndex === -1) {
            mergedLog.push(entry)
          }
        }

        await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true })
        await fs.writeFile(logPath, JSON.stringify(mergedLog, null, 2))
        console.log(`📝 Synced ${lawDocuments.length} laws from store to log file`)
      }
    } catch (error) {
      console.error('Failed to sync log with store documents:', error)
    }

    return NextResponse.json({
      success: true,
      documents: formattedDocuments,
      count: formattedDocuments.length,
      storeId
    })
  } catch (error: any) {
    console.error('[List Store Documents API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '문서 목록 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
