/**
 * Upload Parsed Ordinance API
 * POST /api/admin/upload-parsed-ordinance
 *
 * Uploads a single .md file from data/parsed-ordinances/{districtName}/ to File Search Store
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface UploadParsedOrdinanceRequest {
  fileName: string
  districtName: string
}

export async function POST(request: NextRequest) {
  try {
    const body: UploadParsedOrdinanceRequest = await request.json()
    const { fileName, districtName } = body

    if (!fileName || !districtName) {
      return NextResponse.json(
        { success: false, error: 'fileName과 districtName이 필요합니다' },
        { status: 400 }
      )
    }

    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID
    const apiKey = process.env.GEMINI_API_KEY

    if (!storeId || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_FILE_SEARCH_STORE_ID 또는 GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    // Read markdown file - try multiple locations
    const parsedOrdinancesDir = path.join(process.cwd(), 'data', 'parsed-ordinances')

    // Try 1: Root-level file first
    let filePath = path.join(parsedOrdinancesDir, fileName)

    // Try 2: If not found in root, try district folder
    if (!fs.existsSync(filePath)) {
      filePath = path.join(parsedOrdinancesDir, districtName, fileName)
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: `파일을 찾을 수 없습니다: ${fileName} (루트 또는 ${districtName}/ 폴더에서 찾을 수 없음)` },
        { status: 404 }
      )
    }

    const markdownContent = fs.readFileSync(filePath, 'utf-8')

    // Extract ordinance name from filename
    const ordinanceName = fileName.replace(/\.md$/, '')

    console.log(`[Upload Parsed Ordinance API] Uploading: ${districtName}/${ordinanceName}`)

    // Step 1: Upload file to Gemini Files API
    const blob = new Blob([markdownContent], { type: 'text/plain; charset=utf-8' })
    const file = new File([blob], `${ordinanceName}.txt`, { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file', file)

    const uploadUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey
      },
      body: formData
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('[Upload Parsed Ordinance API] ❌ File upload failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `파일 업로드 실패: ${uploadResponse.status}`,
          details: errorText
        },
        { status: uploadResponse.status }
      )
    }

    const uploadData = await uploadResponse.json()
    const uploadedFileName = uploadData.file?.name || uploadData.name

    if (!uploadedFileName) {
      return NextResponse.json(
        {
          success: false,
          error: '업로드된 파일 이름을 가져올 수 없습니다'
        },
        { status: 500 }
      )
    }

    console.log(`[Upload Parsed Ordinance API] ✓ File uploaded: ${uploadedFileName}`)

    // Step 2: Import file to File Search Store
    const importUrl = `https://generativelanguage.googleapis.com/v1beta/${storeId}:importFile`

    const importResponse = await fetch(importUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        fileName: uploadedFileName,
        customMetadata: [
          { key: 'ordinance_name', stringValue: ordinanceName },
          { key: 'district_name', stringValue: districtName },
          { key: 'law_type', stringValue: '조례' },
          { key: 'file_name', stringValue: fileName },
          { key: 'source', stringValue: 'parsed-ordinances' },
          { key: 'uploaded_at', stringValue: new Date().toISOString() }
        ]
      })
    })

    if (!importResponse.ok) {
      const errorText = await importResponse.text()
      console.error('[Upload Parsed Ordinance API] ❌ Import failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Store 임포트 실패: ${importResponse.status}`,
          details: errorText
        },
        { status: importResponse.status }
      )
    }

    const importData = await importResponse.json()

    console.log(`[Upload Parsed Ordinance API] ✅ Uploaded: ${districtName}/${ordinanceName}`)

    return NextResponse.json({
      success: true,
      ordinanceName,
      districtName,
      documentId: importData.name || importData.document?.name,
      message: `${districtName}/${ordinanceName} 업로드 완료`
    })
  } catch (error: any) {
    console.error('[Upload Parsed Ordinance API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '업로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
