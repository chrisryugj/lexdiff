import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import type { FileResponse } from '@/lib/types';

/**
 * GET /api/files/[id]
 * File Search Store의 특정 Document 상세 정보 조회
 * (일반 파일이 아닌 indexed document 조회)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID;

    if (!storeId) {
      const response: FileResponse = {
        success: false,
        error: 'GEMINI_FILE_SEARCH_STORE_ID not configured',
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Note: SDK may not have direct document.get() method
    // For now, we'll list all documents and find the matching one
    const admin = getGeminiAdmin();
    const documents = await admin.listDocuments(storeId);
    const documentName = `${storeId}/documents/${params.id}`;
    const document = documents.find((d) => d.name === documentName);

    if (!document) {
      const response: FileResponse = {
        success: false,
        error: 'Document not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: FileResponse = {
      success: true,
      file: {
        name: document.name,
        displayName: document.displayName || 'Unnamed',
        mimeType: 'text/plain',
        createTime: document.createTime,
        updateTime: document.updateTime,
        state: 'ACTIVE',
        customMetadata: document.customMetadata,
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[API] Failed to get document ${params.id}:`, error);

    const response: FileResponse = {
      success: false,
      error: error.message || 'Failed to get document',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * DELETE /api/files/[id]
 * File Search Store에서 Document 삭제
 * (일반 파일이 아닌 indexed document 삭제)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID;

    if (!storeId) {
      const response: FileResponse = {
        success: false,
        error: 'GEMINI_FILE_SEARCH_STORE_ID not configured',
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Document name format: fileSearchStores/{storeId}/documents/{docId}
    const documentName = `${storeId}/documents/${params.id}`;
    const admin = getGeminiAdmin();

    // Delete document with force=true (required for indexed documents)
    await admin.deleteDocument(documentName, true);

    const response: FileResponse = {
      success: true,
      message: 'Document deleted successfully',
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[API] Failed to delete document ${params.id}:`, error);

    const response: FileResponse = {
      success: false,
      error: error.message || 'Failed to delete document',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
