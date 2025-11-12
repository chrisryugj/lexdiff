import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import type { FileListResponse } from '@/lib/types';

/**
 * GET /api/files
 * 모든 업로드된 파일 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const admin = getGeminiAdmin();
    const files = await admin.listFiles();

    const response: FileListResponse = {
      success: true,
      files,
      total: files.length,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Failed to list files:', error);

    const response: FileListResponse = {
      success: false,
      files: [],
      total: 0,
      error: error.message || 'Failed to list files',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
