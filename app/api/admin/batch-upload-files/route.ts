/**
 * Batch Upload Files API
 * POST /api/admin/batch-upload-files
 *
 * Uploads multiple files to the active File Search Store
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Maximum concurrent uploads
const MAX_CONCURRENT_UPLOADS = 3

// Import from upload-file route to maintain consistency
const SUPPORTED_MIME_TYPES = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/html': '.html',
  'text/css': '.css',
  'text/csv': '.csv',
  'text/xml': '.xml',
  'text/rtf': '.rtf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.oasis.opendocument.presentation': '.odp',
  'application/x-hwp': '.hwp',
  'application/haansofthwp': '.hwp',
  'application/vnd.hancom.hwp': '.hwp',
  'application/vnd.hancom.hwpx': '.hwpx',
  'application/hwp+zip': '.hwpx',
  'application/x-hwp-v5': '.hwp',
  'text/javascript': '.js',
  'application/javascript': '.js',
  'text/typescript': '.ts',
  'application/typescript': '.ts',
  'text/x-python': '.py',
  'text/x-java': '.java',
  'text/x-c': '.c',
  'text/x-c++': '.cpp',
  'text/x-csharp': '.cs',
  'text/x-php': '.php',
  'text/x-ruby': '.rb',
  'text/x-go': '.go',
  'text/x-rust': '.rs',
  'text/x-kotlin': '.kt',
  'application/json': '.json',
  'application/xml': '.xml',
  'application/x-yaml': '.yaml',
  'application/x-latex': '.tex',
  'application/x-tex': '.tex',
  'application/zip': '.zip',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/aac': '.aac',
  'video/mp4': '.mp4',
  'video/mpeg': '.mpeg',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
}

async function uploadSingleFile(
  file: File,
  storeId: string,
  apiKey: string,
  metadata: Record<string, string> = {}
): Promise<{ success: boolean; fileName: string; documentId?: string; error?: string }> {
  try {
    // Add file info to metadata
    const fileMetadata = {
      ...metadata,
      original_filename: file.name,
      file_type: file.type,
      file_size: file.size.toString(),
      upload_time: new Date().toISOString()
    }

    const uploadFormData = new FormData()
    uploadFormData.append('file', file)

    const metadataHeader = JSON.stringify(fileMetadata)
    const url = `https://generativelanguage.googleapis.com/v1beta/${storeId}/documents:upload`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'x-goog-file-metadata': metadataHeader
      },
      body: uploadFormData
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        fileName: file.name,
        error: `Upload failed: ${response.status}`
      }
    }

    const result = await response.json()

    return {
      success: true,
      fileName: file.name,
      documentId: result.name
    }
  } catch (error: any) {
    return {
      success: false,
      fileName: file.name,
      error: error.message
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID
    const apiKey = process.env.GEMINI_API_KEY

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_FILE_SEARCH_STORE_ID가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const metadataJson = formData.get('metadata') as string

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: '파일이 제공되지 않았습니다' },
        { status: 400 }
      )
    }

    console.log('[Batch Upload API] Uploading', files.length, 'files')

    // Parse shared metadata
    let sharedMetadata: Record<string, string> = {}
    if (metadataJson) {
      try {
        sharedMetadata = JSON.parse(metadataJson)
      } catch (e) {
        console.warn('[Batch Upload API] Failed to parse metadata:', e)
      }
    }

    // Validate file types
    const invalidFiles = files.filter(
      (file) => !SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES]
    )

    if (invalidFiles.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `지원하지 않는 파일 형식이 포함되어 있습니다: ${invalidFiles.map((f) => f.name).join(', ')}`
        },
        { status: 400 }
      )
    }

    // Upload files with concurrency control
    const results: Array<{ success: boolean; fileName: string; documentId?: string; error?: string }> = []

    for (let i = 0; i < files.length; i += MAX_CONCURRENT_UPLOADS) {
      const batch = files.slice(i, i + MAX_CONCURRENT_UPLOADS)
      const batchResults = await Promise.all(
        batch.map((file) => uploadSingleFile(file, storeId, apiKey, sharedMetadata))
      )
      results.push(...batchResults)

      console.log(
        `[Batch Upload API] Progress: ${Math.min(i + MAX_CONCURRENT_UPLOADS, files.length)}/${files.length}`
      )
    }

    const successCount = results.filter((r) => r.success).length
    const failureCount = results.filter((r) => !r.success).length

    console.log('[Batch Upload API] ✅ Completed:', {
      total: files.length,
      success: successCount,
      failure: failureCount
    })

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: files.length,
        success: successCount,
        failure: failureCount
      },
      message: `✅ ${successCount}개 파일 업로드 완료${failureCount > 0 ? `, ${failureCount}개 실패` : ''}`
    })
  } catch (error: any) {
    console.error('[Batch Upload API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '일괄 업로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
