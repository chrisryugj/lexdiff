/**
 * 영향 분석 API
 *
 * GET /api/impact-analysis?lawId=MST_100000&jo=003800&depth=3
 *
 * 법령 조문의 상향/하향/횡단/판례 영향을 분석하여 반환한다.
 */

import { NextRequest, NextResponse } from "next/server"
import { analyzeImpact } from "@/lib/relation-graph/impact-analysis"
import { isSupabaseAvailable } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const lawId = searchParams.get("lawId")
  const jo = searchParams.get("jo")
  const depth = parseInt(searchParams.get("depth") || "3", 10)

  if (!lawId) {
    return NextResponse.json(
      { error: "lawId 파라미터가 필요합니다" },
      { status: 400 },
    )
  }

  if (!isSupabaseAvailable()) {
    return NextResponse.json(
      { success: true, impact: { downstream: [], upstream: [], lateral: [], precedents: [], stats: { total: 0, byRelation: {} } }, message: "관계 DB 미설정" },
    )
  }

  const maxDepth = Math.min(Math.max(depth, 1), 5) // 1~5 범위 제한

  const impact = await analyzeImpact(lawId, jo || undefined, maxDepth)

  return NextResponse.json({
    success: true,
    impact,
  })
}
