import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';

/**
 * GET /api/stats
 * 저장소 통계 조회
 */
export async function GET(request: NextRequest) {
  try {
    const admin = getGeminiAdmin();
    const stats = await admin.getStorageStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('[API] Failed to get stats:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get stats',
      },
      { status: 500 }
    );
  }
}
