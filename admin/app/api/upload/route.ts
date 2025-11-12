import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAdmin } from '@/lib/gemini-admin';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import type { FileResponse } from '@/lib/types';

/**
 * POST /api/upload
 * 파일 업로드 (multipart/form-data)
 *
 * Form fields:
 * - file: File (required)
 * - displayName: string (optional)
 * - storeName: string (optional) - "fileSearchStores/abc123xyz"
 * - metadata: JSON string (optional) - {"law_name": "관세법", "article": "38"}
 */
export async function POST(request: NextRequest) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const displayName = formData.get('displayName') as string | null;
    const storeName = formData.get('storeName') as string | null;
    const metadataStr = formData.get('metadata') as string | null;

    // Validation
    if (!file) {
      const response: FileResponse = {
        success: false,
        error: 'File is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // File size check (2GB limit)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      const response: FileResponse = {
        success: false,
        error: 'File size must be under 2GB',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Parse metadata
    let metadata: Record<string, string> | undefined;
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        const response: FileResponse = {
          success: false,
          error: 'Invalid metadata JSON',
        };
        return NextResponse.json(response, { status: 400 });
      }
    }

    // Save file to temp directory
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    tempPath = join('/tmp', `gemini-upload-${Date.now()}-${file.name}`);

    await writeFile(tempPath, buffer);
    console.log(`[API] File saved to temp: ${tempPath}`);

    const admin = getGeminiAdmin();

    // Upload to Gemini (and optionally to Store)
    let uploadedFile;

    if (storeName) {
      // Upload directly to Store (includes indexing)
      console.log(`[API] Uploading to store: ${storeName}`);
      uploadedFile = await admin.uploadToStore(
        tempPath,
        storeName,
        displayName || file.name,
        file.type,
        metadata
      );
    } else {
      // Upload to Files API only
      console.log('[API] Uploading to Files API');
      uploadedFile = await admin.uploadFile(
        tempPath,
        displayName || file.name,
        file.type,
        metadata
      );
    }

    // Clean up temp file
    await unlink(tempPath);
    console.log(`[API] Temp file deleted: ${tempPath}`);

    const response: FileResponse = {
      success: true,
      file: uploadedFile,
      message: storeName
        ? 'File uploaded and indexed successfully'
        : 'File uploaded successfully',
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Failed to upload file:', error);

    // Clean up temp file on error
    if (tempPath) {
      try {
        await unlink(tempPath);
        console.log(`[API] Temp file deleted after error: ${tempPath}`);
      } catch {
        // Ignore cleanup errors
      }
    }

    const response: FileResponse = {
      success: false,
      error: error.message || 'Failed to upload file',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
