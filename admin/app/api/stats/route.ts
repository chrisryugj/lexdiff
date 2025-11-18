import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';

/**
 * GET /api/stats
 * 저장소 통계 조회 (빠른 카운트 포함)
 */
export async function GET(request: NextRequest) {
  try {
    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID;

    if (!storeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'GEMINI_FILE_SEARCH_STORE_ID not configured',
        },
        { status: 500 }
      );
    }

    const admin = getGeminiAdmin();

    // Fast count of documents in store
    const documents = await admin.listDocuments(storeId);
    const documentCount = documents.length;

    // Storage stats
    const storageStats = await admin.getStorageStats();

    return NextResponse.json({
      success: true,
      stats: {
        ...storageStats,
        documentCount,
        storeId,
      },
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
