import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import type { FileSearchStoreResponse } from '@/lib/types';

/**
 * GET /api/stores/[id]
 * 특정 Store 상세 정보 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storeName = `fileSearchStores/${params.id}`;
    const admin = getGeminiAdmin();
    const store = await admin.getStore(storeName);

    const response: FileSearchStoreResponse = {
      success: true,
      store,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[API] Failed to get store ${params.id}:`, error);

    const response: FileSearchStoreResponse = {
      success: false,
      error: error.message || 'Failed to get store',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * DELETE /api/stores/[id]
 * Store 삭제
 *
 * Query params: ?force=true (파일이 있어도 강제 삭제)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const storeName = `fileSearchStores/${params.id}`;
    const admin = getGeminiAdmin();

    await admin.deleteStore(storeName, force);

    const response: FileSearchStoreResponse = {
      success: true,
      message: `Store deleted successfully${force ? ' (forced)' : ''}`,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[API] Failed to delete store ${params.id}:`, error);

    const response: FileSearchStoreResponse = {
      success: false,
      error: error.message || 'Failed to delete store',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
