/**
 * Save Parsed Law API
 * POST /api/admin/save-parsed
 *
 * Saves parsed law markdown and metadata to local files
 */

import { NextRequest, NextResponse } from 'next/server'
import { saveParsedLaw } from '@/lib/file-storage'
import type { ParsedLawMetadata } from '@/lib/law-parser-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SaveParsedRequest {
  lawId: string
  markdown: string
  metadata: ParsedLawMetadata
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveParsedRequest = await request.json()
    const { lawId, markdown, metadata } = body

    if (!lawId || !markdown || !metadata) {
      return NextResponse.json(
        { success: false, error: '필수 데이터가 누락되었습니다' },
        { status: 400 }
      )
    }

    console.log(`[Save Parsed API] Saving: ${lawId} - ${metadata.lawName}`)

    const savedFile = await saveParsedLaw(lawId, markdown, metadata)

    console.log(`[Save Parsed API] ✅ Saved: ${savedFile.markdownPath}`)

    return NextResponse.json({
      success: true,
      file: savedFile
    })
  } catch (error: any) {
    console.error('[Save Parsed API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '저장 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
