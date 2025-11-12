import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import type { FileSearchStoreListResponse, FileSearchStoreResponse } from '@/lib/types';

/**
 * GET /api/stores
 * 모든 File Search Store 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const admin = getGeminiAdmin();
    const stores = await admin.listStores();

    const response: FileSearchStoreListResponse = {
      success: true,
      stores,
      total: stores.length,
      limit: 10,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Failed to list stores:', error);

    const response: FileSearchStoreListResponse = {
      success: false,
      stores: [],
      total: 0,
      limit: 10,
      error: error.message || 'Failed to list stores',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * POST /api/stores
 * 새 File Search Store 생성
 *
 * Body: { displayName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { displayName } = await request.json();

    if (!displayName || typeof displayName !== 'string') {
      const response: FileSearchStoreResponse = {
        success: false,
        error: 'displayName is required and must be a string',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const admin = getGeminiAdmin();
    const store = await admin.createStore(displayName);

    const response: FileSearchStoreResponse = {
      success: true,
      store,
      message: `Store "${displayName}" created successfully`,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Failed to create store:', error);

    const response: FileSearchStoreResponse = {
      success: false,
      error: error.message || 'Failed to create store',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
