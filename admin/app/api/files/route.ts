import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import type { FileListResponse } from '@/lib/types';

/**
 * GET /api/files
 * File Search Store의 모든 Documents 목록 조회
 * (일반 Files가 아닌 indexed Documents를 조회)
 */
export async function GET(request: NextRequest) {
  try {
    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID;

    if (!storeId) {
      const response: FileListResponse = {
        success: false,
        files: [],
        total: 0,
        error: 'GEMINI_FILE_SEARCH_STORE_ID not configured',
      };
      return NextResponse.json(response, { status: 500 });
    }

    const admin = getGeminiAdmin();
    const documents = await admin.listDocuments(storeId);

    // Convert documents to file format for compatibility
    const files = documents.map((doc) => ({
      name: doc.name,
      displayName: doc.displayName || 'Unnamed',
      mimeType: 'text/plain',
      createTime: doc.createTime,
      updateTime: doc.updateTime,
      state: 'ACTIVE',
      customMetadata: doc.customMetadata,
    }));

    const response: FileListResponse = {
      success: true,
      files,
      total: files.length,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Failed to list documents:', error);

    const response: FileListResponse = {
      success: false,
      files: [],
      total: 0,
      error: error.message || 'Failed to list documents',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
