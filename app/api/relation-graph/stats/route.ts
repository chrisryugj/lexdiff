/**
 * 관계 그래프 DB 상태 API
 *
 * GET /api/relation-graph/stats
 * → { nodes, edges }
 */

import { NextResponse } from "next/server"
import { getSupabase, isSupabaseAvailable } from "@/lib/supabase"

export async function GET() {
  if (!isSupabaseAvailable()) {
    return NextResponse.json({ available: false, message: "Supabase 미설정" })
  }

  const client = getSupabase()
  if (!client) {
    return NextResponse.json({ available: false, message: "Supabase 연결 실패" })
  }

  try {
    const [nodeResult, edgeResult] = await Promise.all([
      client.from('law_node').select('*', { count: 'exact', head: true }),
      client.from('law_edge').select('*', { count: 'exact', head: true }),
    ])

    return NextResponse.json({
      available: true,
      nodes: nodeResult.count ?? 0,
      edges: edgeResult.count ?? 0,
    })
  } catch {
    // CWE-209: 내부 에러 메시지(스키마/연결 정보)를 클라이언트에 노출하지 않는다
    return NextResponse.json(
      { available: false, message: "DB 조회 실패" },
      { status: 500 },
    )
  }
}
