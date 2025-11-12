import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import type { FileResponse } from '@/lib/types';

/**
 * GET /api/files/[id]
 * 특정 파일 상세 정보 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileName = `files/${params.id}`;
    const admin = getGeminiAdmin();
    const file = await admin.getFile(fileName);

    const response: FileResponse = {
      success: true,
      file,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[API] Failed to get file ${params.id}:`, error);

    const response: FileResponse = {
      success: false,
      error: error.message || 'Failed to get file',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * DELETE /api/files/[id]
 * 파일 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileName = `files/${params.id}`;
    const admin = getGeminiAdmin();

    await admin.deleteFile(fileName);

    const response: FileResponse = {
      success: true,
      message: 'File deleted successfully',
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[API] Failed to delete file ${params.id}:`, error);

    const response: FileResponse = {
      success: false,
      error: error.message || 'Failed to delete file',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
