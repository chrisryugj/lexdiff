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

    console.log('[List Store Documents API] Fetching documents from store...')

    // List documents with pagination (increased page size for better performance)
    const allDocuments: any[] = []
    let pageToken: string | undefined = undefined
    let hasMore = true
    let pageCount = 0

    while (hasMore) {
      pageCount++
      const url = `https://generativelanguage.googleapis.com/v1beta/${storeId}/documents?pageSize=100${
        pageToken ? `&pageToken=${pageToken}` : ''
      }`

      console.log(`[List Store Documents API] Fetching page ${pageCount}...`)

      const response = await fetch(url, {
        headers: {
          'x-goog-api-key': apiKey
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[List Store Documents API] ❌ Request failed:', errorText)
        return NextResponse.json(
          {
            success: false,
            error: `문서 목록 조회 실패: ${response.status}`
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
