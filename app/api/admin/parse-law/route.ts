/**
 * Parse Law API
 * POST /api/admin/parse-law
 *
 * Fetches law from law.go.kr API and parses it
 * Returns preview data for user verification
 */

import { NextRequest, NextResponse } from 'next/server'
import { parseLawByNameOrId } from '@/lib/law-parser-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ParseLawRequest {
  query: string // Law name or ID
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseLawRequest = await request.json()
    const { query } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: '검색어를 입력해주세요' },
        { status: 400 }
      )
    }

    const apiKey = process.env.LAW_OC

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'LAW_OC 환경변수가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    console.log('[Parse Law API] Parsing law:', query)

    const result = await parseLawByNameOrId(query, apiKey)

    if (result.success) {
      console.log(
        `[Parse Law API] ✅ Success: ${result.law.metadata.lawName} (${result.law.metadata.articleCount} articles)`
      )

      return NextResponse.json({
        success: true,
        law: {
          lawId: result.law.metadata.lawId,
          lawName: result.law.metadata.lawName,
          effectiveDate: result.law.metadata.effectiveDate,
          promulgationDate: result.law.metadata.promulgationDate,
          promulgationNumber: result.law.metadata.promulgationNumber,
          revisionType: result.law.metadata.revisionType,
          articleCount: result.law.metadata.articleCount,
          totalCharacters: result.law.metadata.totalCharacters,
          markdown: result.law.markdown,
          markdownSize: Buffer.byteLength(result.law.markdown, 'utf8')
        }
      })
    } else {
      console.log('[Parse Law API] ⚠️ Multiple candidates or error:', result.error)

      return NextResponse.json({
        success: false,
        error: result.error,
        candidates: result.candidates?.map((c: any) => ({
          lawId: c.법령ID || c.법령키,
          lawName: c.법령명한글 || c.법령명_한글 || c.법령명,
          effectiveDate: c.시행일자 || c.최종시행일자,
          promulgationDate: c.공포일자,
          revisionType: c.제개정구분명 || c.제개정구분
        }))
      })
    }
  } catch (error: any) {
    console.error('[Parse Law API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '알 수 없는 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
