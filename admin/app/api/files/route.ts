import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import type { FileListResponse } from '@/lib/types';

/**
 * GET /api/files
 * File Search Store의 Documents 목록 조회 (페이지네이션 지원)
 * Query params:
 *   - page: 페이지 번호 (1부터 시작, 기본값: 1)
 *   - limit: 페이지당 항목 수 (기본값: 100, 최대: 1000)
 *   - search: 검색어 (displayName에서 검색)
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

    // Query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);
    const searchQuery = searchParams.get('search') || '';

    const admin = getGeminiAdmin();
    const documents = await admin.listDocuments(storeId);

    // Filter by search query
    let filteredDocs = documents;
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase();
      filteredDocs = documents.filter((doc) =>
        (doc.displayName || '').toLowerCase().includes(lowerSearch)
      );
    }

    // Pagination
    const total = filteredDocs.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedDocs = filteredDocs.slice(startIndex, endIndex);

    // Convert documents to file format for compatibility
    const files = paginatedDocs.map((doc) => ({
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
      total,
      page,
      totalPages,
      limit,
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
