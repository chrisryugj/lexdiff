/**
 * Upload to Store API
 * POST /api/admin/upload-to-store
 *
 * Uploads parsed laws from local files to File Search Store
 */

import { NextRequest, NextResponse } from 'next/server'
import { readParsedLaw, logUpload } from '@/lib/file-storage'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes timeout

interface UploadToStoreRequest {
  lawIds: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body: UploadToStoreRequest = await request.json()
    const { lawIds } = body

    if (!lawIds || !Array.isArray(lawIds) || lawIds.length === 0) {
      return NextResponse.json({ success: false, error: '업로드할 법령을 선택해주세요' }, { status: 400 })
    }

    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID
    const apiKey = process.env.GEMINI_API_KEY

    if (!storeId || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_FILE_SEARCH_STORE_ID 또는 GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    console.log(`[Upload to Store API] Starting upload for ${lawIds.length} laws...`)

    const results: any[] = []

    for (const lawId of lawIds) {
      console.log(`[Upload to Store API] Processing: ${lawId}`)

      try {
        const lawData = await readParsedLaw(lawId)

        if (!lawData) {
          const errorMsg = `법령 파일을 찾을 수 없습니다: ${lawId}`
          console.error(`[Upload to Store API] ❌ ${errorMsg}`)
          results.push({ lawId, status: 'error', error: errorMsg })
          await logUpload(lawId, '알 수 없음', 'error', errorMsg)
          continue
        }

        const { markdown, metadata } = lawData
        const lawName = metadata.lawName

        // Create temporary file for upload
        const tmpDir = os.tmpdir()
        const tmpFilePath = path.join(tmpDir, `${lawId}.txt`)
        await fs.writeFile(tmpFilePath, markdown, 'utf-8')

        console.log(`[Upload to Store API] Uploading: ${lawName} (${lawId})`)

        // Upload using File Search API
        const uploadResult = await uploadToFileSearchStore(tmpFilePath, lawName, storeId, apiKey)

        // Clean up temp file
        await fs.unlink(tmpFilePath)

        if (uploadResult.success) {
          console.log(`[Upload to Store API] ✅ Success: ${lawName}`)
          results.push({
            lawId,
            lawName,
            status: 'success',
            documentId: uploadResult.documentId
          })
          await logUpload(lawId, lawName, 'success')
        } else {
          console.error(`[Upload to Store API] ❌ Failed: ${lawName} - ${uploadResult.error}`)
          results.push({
            lawId,
            lawName,
            status: 'error',
            error: uploadResult.error
          })
          await logUpload(lawId, lawName, 'error', uploadResult.error)
        }
      } catch (error: any) {
        console.error(`[Upload to Store API] ❌ Exception for ${lawId}:`, error)
        results.push({
          lawId,
          status: 'error',
          error: error.message || '알 수 없는 오류'
        })
        await logUpload(lawId, '알 수 없음', 'error', error.message)
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length
    const errorCount = results.filter((r) => r.status === 'error').length

    console.log(
      `[Upload to Store API] ✅ Complete: ${successCount} success, ${errorCount} errors (out of ${lawIds.length})`
    )

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: lawIds.length,
        success: successCount,
        errors: errorCount
      }
    })
  } catch (error: any) {
    console.error('[Upload to Store API] ❌ Fatal error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '업로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}

/**
 * Upload file to File Search Store using REST API
 */
async function uploadToFileSearchStore(
  filePath: string,
  displayName: string,
  storeId: string,
  apiKey: string
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    // Read file content
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const fileBuffer = Buffer.from(fileContent, 'utf-8')

    // Create multipart form data
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2)

    let body = ''
    body += `--${boundary}\r\n`
    body += `Content-Disposition: form-data; name="file"; filename="${displayName}.txt"\r\n`
    body += `Content-Type: text/plain\r\n\r\n`
    body += fileContent
    body += `\r\n--${boundary}--\r\n`

    // Upload file
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/${storeId}/documents:upload`

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'x-goog-api-key': apiKey
      },
      body: body
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('[Upload] Upload failed:', errorText)
      return {
        success: false,
        error: `Upload failed: ${uploadResponse.status} - ${errorText}`
      }
    }

    const uploadData = await uploadResponse.json()

    // Wait for upload operation to complete
    const operationName = uploadData.name

    if (!operationName) {
      console.error('[Upload] No operation name in response:', uploadData)
      return {
        success: false,
        error: 'No operation name in upload response'
      }
    }

    console.log(`[Upload] Waiting for operation: ${operationName}`)

    // Poll operation status
    let done = false
    let attempts = 0
    const maxAttempts = 30 // 30 attempts * 2 seconds = 60 seconds max

    while (!done && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds
      attempts++

      const operationUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}`

      const opResponse = await fetch(operationUrl, {
        headers: {
          'x-goog-api-key': apiKey
        }
      })

      if (!opResponse.ok) {
        const errorText = await opResponse.text()
        console.error('[Upload] Operation check failed:', errorText)
        return {
          success: false,
          error: `Operation check failed: ${opResponse.status}`
        }
      }

      const opData = await opResponse.json()
      done = opData.done === true

      if (done) {
        if (opData.error) {
          console.error('[Upload] Operation failed:', opData.error)
          return {
            success: false,
            error: `Upload operation failed: ${JSON.stringify(opData.error)}`
          }
        }

        // Success - extract document ID
        const documentId = opData.response?.document?.name || opData.response?.name

        console.log(`[Upload] ✅ Upload complete: ${documentId}`)

        return {
          success: true,
          documentId
        }
      }

      console.log(`[Upload] Waiting... (attempt ${attempts}/${maxAttempts})`)
    }

    if (!done) {
      return {
        success: false,
        error: 'Upload operation timed out'
      }
    }

    return {
      success: false,
      error: 'Unexpected upload result'
    }
  } catch (error: any) {
    console.error('[Upload] Exception:', error)
    return {
      success: false,
      error: error.message || 'Upload exception'
    }
  }
}
