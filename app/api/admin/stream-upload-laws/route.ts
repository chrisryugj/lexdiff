/**
 * Stream Upload Laws API
 * SSE streaming for law uploads with abort support
 */

import { NextRequest } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

interface UploadRequest {
  fileNames: string[]
  delay?: number
}

async function uploadSingleLaw(fileName: string): Promise<{
  fileName: string
  status: 'success' | 'error'
  error?: string
  documentId?: string
}> {
  try {
    if (!STORE_ID || !API_KEY) {
      throw new Error('Missing environment variables')
    }

    // Read file
    const parsedLawsDir = path.join(process.cwd(), 'data', 'parsed-laws')
    const filePath = path.join(parsedLawsDir, fileName)

    const fileExists = await fs.access(filePath).then(() => true).catch(() => false)
    if (!fileExists) {
      throw new Error(`파일을 찾을 수 없습니다: ${fileName}`)
    }

    const content = await fs.readFile(filePath, 'utf-8')

    // Extract law name from first line
    const firstLine = content.split('\n')[0]
    const lawName = firstLine.replace(/^#\s*/, '').trim()

    // Step 1: Upload to Gemini File API
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' })
    const file = new File([blob], fileName, { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file', file)

    const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files`, {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY },
      body: formData
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text()
      throw new Error(`Upload failed (${uploadResponse.status}): ${error}`)
    }

    const uploadedFile = await uploadResponse.json()
    const fileNameGemini = uploadedFile.file?.name || uploadedFile.name

    if (!fileNameGemini) {
      throw new Error('File upload did not return a file name')
    }

    // Step 2: Import to File Search Store
    const importUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}:importFile`

    const importResponse = await fetch(importUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        fileName: fileNameGemini,
        customMetadata: [
          { key: 'law_name', stringValue: lawName },
          { key: 'law_type', stringValue: '법령' },
          { key: 'file_name', stringValue: fileName },
          { key: 'source', stringValue: 'parsed-laws' },
          { key: 'uploaded_at', stringValue: new Date().toISOString() }
        ]
      })
    })

    if (!importResponse.ok) {
      const error = await importResponse.text()
      throw new Error(`Import failed (${importResponse.status}): ${error}`)
    }

    const importResult = await importResponse.json()
    const documentId = importResult.document?.name || importResult.name

    return {
      fileName,
      status: 'success',
      documentId
    }
  } catch (error: any) {
    return {
      fileName,
      status: 'error',
      error: error.message
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: UploadRequest = await request.json()
    const { fileNames, delay = 100 } = body

    if (!fileNames || fileNames.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '파일이 선택되지 않았습니다' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!STORE_ID || !API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API 설정이 없습니다' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`[Stream Upload Laws] Starting upload of ${fileNames.length} files`)

    const encoder = new TextEncoder()
    let aborted = false

    const stream = new ReadableStream({
      async start(controller) {
        let successCount = 0
        let errorCount = 0
        const total = fileNames.length
        const results: Array<{ fileName: string; status: string; error?: string }> = []

        const sendEvent = (data: any) => {
          if (!aborted) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          }
        }

        // Send initial info
        sendEvent({ type: 'start', total })

        for (let i = 0; i < fileNames.length && !aborted; i++) {
          const fileName = fileNames[i]

          // Send progress before starting each file
          sendEvent({
            type: 'uploading',
            current: i + 1,
            total,
            fileName,
            successCount,
            errorCount
          })

          const result = await uploadSingleLaw(fileName)
          results.push(result)

          if (result.status === 'success') {
            successCount++
          } else {
            errorCount++
          }

          // Send result for this file
          sendEvent({
            type: 'progress',
            current: i + 1,
            total,
            fileName: result.fileName,
            status: result.status,
            error: result.error,
            successCount,
            errorCount
          })

          // Small delay between uploads
          if (i < fileNames.length - 1 && !aborted) {
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }

        // Send final result
        sendEvent({
          type: 'complete',
          success: true,
          total,
          successCount,
          errorCount,
          results
        })

        console.log(`[Stream Upload Laws] ✅ 완료: 성공 ${successCount}, 실패 ${errorCount} (총 ${total}개)`)
        controller.close()
      },
      cancel() {
        aborted = true
        console.log(`[Stream Upload Laws] ⛔ 클라이언트가 연결을 끊음 - 업로드 중지`)
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error: any) {
    console.error('[Stream Upload Laws] ❌ Error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
