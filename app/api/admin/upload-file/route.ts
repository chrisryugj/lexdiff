/**
 * Upload File API
 * POST /api/admin/upload-file
 *
 * Uploads a file to the active File Search Store
 * Supports all file types that Gemini File Search supports
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Supported file types by Google File Search
// Based on Google AI documentation and File Search API capabilities
const SUPPORTED_MIME_TYPES = {
  // Documents - PDF
  'application/pdf': '.pdf',

  // Plain text
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/html': '.html',
  'text/css': '.css',
  'text/csv': '.csv',
  'text/xml': '.xml',
  'text/rtf': '.rtf',

  // MS Office formats
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',

  // OpenDocument formats
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.oasis.opendocument.presentation': '.odp',

  // Korean document formats (HWP/HWPX)
  'application/x-hwp': '.hwp',
  'application/haansofthwp': '.hwp',
  'application/vnd.hancom.hwp': '.hwp',
  'application/vnd.hancom.hwpx': '.hwpx',
  'application/hwp+zip': '.hwpx',
  'application/x-hwp-v5': '.hwp',

  // Programming languages
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
  'text/x-swift': '.swift',
  'text/x-scala': '.scala',
  'text/x-r': '.r',
  'text/x-perl': '.pl',
  'text/x-lua': '.lua',
  'text/x-shell': '.sh',

  // Data formats
  'application/json': '.json',
  'application/xml': '.xml',
  'application/x-yaml': '.yaml',
  'application/x-toml': '.toml',

  // LaTeX
  'application/x-latex': '.tex',
  'application/x-tex': '.tex',

  // Archives
  'application/zip': '.zip',

  // Images (for multimodal understanding)
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',

  // Audio
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'audio/ogg': '.ogg',

  // Video
  'video/mp4': '.mp4',
  'video/mpeg': '.mpeg',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/webm': '.webm',
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
    const file = formData.get('file') as File
    const displayName = formData.get('displayName') as string || file.name
    const metadataJson = formData.get('metadata') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: '파일이 제공되지 않았습니다' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES]) {
      return NextResponse.json(
        {
          success: false,
          error: `지원하지 않는 파일 형식입니다: ${file.type}\n\n지원되는 형식: PDF, HWP/HWPX, MS Office (DOC/DOCX/XLS/XLSX/PPT/PPTX), OpenDocument (ODT/ODS/ODP), 텍스트 (TXT/MD/HTML/CSS/CSV/RTF), 코드 파일 (JS/TS/PY/JAVA/C/CPP/GO/RS 등), 데이터 (JSON/XML/YAML), 이미지 (PNG/JPG/WEBP/GIF), 오디오 (MP3/WAV/AAC), 비디오 (MP4/MOV/WEBM) 등`
        },
        { status: 400 }
      )
    }

    console.log('[Upload File API] Uploading file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      displayName
    })

    // Parse metadata if provided
    let metadata: Record<string, string> = {}
    if (metadataJson) {
      try {
        metadata = JSON.parse(metadataJson)
      } catch (e) {
        console.warn('[Upload File API] Failed to parse metadata:', e)
      }
    }

    // Add file info to metadata
    metadata.original_filename = file.name
    metadata.file_type = file.type
    metadata.file_size = file.size.toString()
    metadata.upload_time = new Date().toISOString()

    // Upload to File Search Store
    const uploadFormData = new FormData()
    uploadFormData.append('file', file)

    // Add metadata as JSON string in x-goog-file-metadata header
    const metadataHeader = JSON.stringify(metadata)

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
      console.error('[Upload File API] ❌ Upload failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `파일 업로드 실패: ${response.status}`,
          details: errorText
        },
        { status: response.status }
      )
    }

    const result = await response.json()

    console.log('[Upload File API] ✅ File uploaded:', result)

    return NextResponse.json({
      success: true,
      document: {
        id: result.name,
        displayName: displayName,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        state: result.state,
        createTime: result.createTime,
        updateTime: result.updateTime
      },
      message: `✅ "${file.name}" 업로드 완료!`
    })
  } catch (error: any) {
    console.error('[Upload File API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '파일 업로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
