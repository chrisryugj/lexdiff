'use client';

import { useEffect, useState } from 'react';
import type { FileSearchStore, GeminiFile } from '@/lib/types';
import LogImport from './log-import';

interface FileUploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'indexing' | 'completed' | 'failed';
  error?: string;
  result?: GeminiFile;
}

type UploadTab = 'general' | 'law' | 'ordinance';

export default function FileUploadForm() {
  const [activeTab, setActiveTab] = useState<UploadTab>('general');
  const [uploads, setUploads] = useState<FileUploadItem[]>([]);
  const [metadata, setMetadata] = useState({
    law_name: '',
    article_number: '',
    law_type: 'law',
    effective_date: '',
  });
  const [dragging, setDragging] = useState(false);

  function handleFileSelect(files: FileList | null) {
    if (!files) return;

    const newUploads: FileUploadItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // File size check
      if (file.size > 2 * 1024 * 1024 * 1024) {
        alert(`${file.name} is too large (max 2GB)`);
        continue;
      }

      newUploads.push({
        id: `${Date.now()}-${i}`,
        file,
        progress: 0,
        status: 'pending',
      });
    }

    setUploads((prev) => [...prev, ...newUploads]);
  }

  async function uploadFile(upload: FileUploadItem) {
    const formData = new FormData();
    formData.append('file', upload.file);
    formData.append('displayName', upload.file.name);

    // Add metadata if any field is filled
    const metadataObj: Record<string, string> = {};
    if (metadata.law_name) metadataObj.law_name = metadata.law_name;
    if (metadata.article_number) metadataObj.article_number = metadata.article_number;
    if (metadata.law_type) metadataObj.law_type = metadata.law_type;
    if (metadata.effective_date) metadataObj.effective_date = metadata.effective_date;

    if (Object.keys(metadataObj).length > 0) {
      formData.append('metadata', JSON.stringify(metadataObj));
    }

    try {
      // Update status to uploading
      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id ? { ...u, status: 'uploading', progress: 25 } : u
        )
      );

      const res = await fetch('/api/admin/upload-file', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        // Update status to completed
        setUploads((prev) =>
          prev.map((u) =>
            u.id === upload.id
              ? {
                  ...u,
                  status: 'completed',
                  progress: 100,
                  result: data.document || data.file,
                }
              : u
          )
        );
      } else {
        // Update status to failed
        setUploads((prev) =>
          prev.map((u) =>
            u.id === upload.id
              ? {
                  ...u,
                  status: 'failed',
                  progress: 0,
                  error: data.error,
                }
              : u
          )
        );
      }
    } catch (err: any) {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id
            ? {
                ...u,
                status: 'failed',
                progress: 0,
                error: err.message,
              }
            : u
        )
      );
    }
  }

  async function uploadAll() {
    const pendingUploads = uploads.filter((u) => u.status === 'pending');

    for (const upload of pendingUploads) {
      await uploadFile(upload);
    }
  }

  function removeUpload(id: string) {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }

  function clearCompleted() {
    setUploads((prev) => prev.filter((u) => u.status !== 'completed'));
  }

  function handleLogImport(uploadedFiles: string[]) {
    // 로그에서 가져온 파일들을 completed 상태로 추가
    const newUploads: FileUploadItem[] = uploadedFiles.map((filename, i) => {
      // Create a mock File object for display
      const mockFile = new File([''], filename, { type: 'text/markdown' });

      return {
        id: `log-import-${Date.now()}-${i}`,
        file: mockFile,
        progress: 100,
        status: 'completed' as const,
        result: {
          name: `fileSearchStores/${process.env.NEXT_PUBLIC_STORE_ID || 'unknown'}/documents/${filename}`,
          displayName: filename,
          mimeType: 'text/markdown',
          state: 'ACTIVE',
        } as GeminiFile,
      };
    });

    setUploads((prev) => [...newUploads, ...prev]);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }

  const pendingCount = uploads.filter((u) => u.status === 'pending').length;
  const uploadingCount = uploads.filter((u) => u.status === 'uploading' || u.status === 'indexing').length;
  const completedCount = uploads.filter((u) => u.status === 'completed').length;
  const failedCount = uploads.filter((u) => u.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'general'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📁 일반 파일 업로드
            </button>
            <button
              onClick={() => setActiveTab('law')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'law'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              ⚖️ 법령 업로드
            </button>
            <button
              onClick={() => setActiveTab('ordinance')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'ordinance'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📜 조례 업로드
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && (
        <>
          {/* Drop Zone */}
          <div
            className={`bg-white rounded-lg shadow p-12 border-2 border-dashed transition-all duration-200 ${
              dragging
                ? 'border-purple-500 bg-purple-50 scale-[1.02]'
                : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <svg
                className={`mx-auto h-16 w-16 transition-colors ${
                  dragging ? 'text-purple-500' : 'text-gray-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                파일을 여기에 드래그하거나
              </h3>
              <label className="mt-4 inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-purple-800 cursor-pointer transition-all shadow-md hover:shadow-lg">
                📁 파일 선택
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
              </label>
              <p className="mt-6 text-xs text-gray-500 leading-relaxed">
                <strong className="text-gray-700">지원 형식:</strong> PDF, HWP/HWPX, MS Office (DOC/XLS/PPT), 텍스트 (TXT/MD/HTML), 코드, 이미지, 오디오, 비디오
                <br />
                <strong className="text-gray-700">최대 용량:</strong> 파일당 2GB | 프로젝트당 20GB
              </p>
            </div>
          </div>
        </>
      )}

      {activeTab === 'law' && (
        <>
          {/* Configuration */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">법령 메타데이터</h3>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4">
          <input
            type="text"
            value={metadata.law_name}
            onChange={(e) =>
              setMetadata({ ...metadata, law_name: e.target.value })
            }
            placeholder="법령명 (예: 관세법)"
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="text"
            value={metadata.article_number}
            onChange={(e) =>
              setMetadata({ ...metadata, article_number: e.target.value })
            }
            placeholder="조문번호 (예: 38)"
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={metadata.law_type}
            onChange={(e) =>
              setMetadata({ ...metadata, law_type: e.target.value })
            }
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="law">법률</option>
            <option value="decree">시행령</option>
            <option value="rule">시행규칙</option>
            <option value="ordinance">조례</option>
          </select>
          <input
            type="date"
            value={metadata.effective_date}
            onChange={(e) =>
              setMetadata({ ...metadata, effective_date: e.target.value })
            }
            placeholder="시행일자"
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <p className="text-xs text-gray-500 mt-3">
          💡 파일은 자동으로 File Search Store에 업로드되어 AI 검색에 사용됩니다
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className={`bg-white rounded-lg shadow p-12 border-2 border-dashed transition-all duration-200 ${
          dragging
            ? 'border-purple-500 bg-purple-50 scale-[1.02]'
            : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <svg
            className={`mx-auto h-16 w-16 transition-colors ${
              dragging ? 'text-purple-500' : 'text-gray-400'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            파일을 여기에 드래그하거나
          </h3>
          <label className="mt-4 inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-purple-800 cursor-pointer transition-all shadow-md hover:shadow-lg">
            📁 파일 선택
            <input
              type="file"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </label>
          <p className="mt-6 text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-700">지원 형식:</strong> PDF, HWP/HWPX, MD 파일
            <br />
            <strong className="text-gray-700">최대 용량:</strong> 파일당 2GB
          </p>
        </div>
      </div>
        </>
      )}

      {activeTab === 'ordinance' && (
        <>
          {/* Configuration */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">조례 메타데이터</h3>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                value={metadata.law_name}
                onChange={(e) =>
                  setMetadata({ ...metadata, law_name: e.target.value })
                }
                placeholder="조례명 (예: 서울특별시 도시계획 조례)"
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <input
                type="text"
                value={metadata.article_number}
                onChange={(e) =>
                  setMetadata({ ...metadata, article_number: e.target.value })
                }
                placeholder="조문번호 (예: 10)"
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <select
                value={metadata.law_type}
                onChange={(e) =>
                  setMetadata({ ...metadata, law_type: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="ordinance">조례</option>
                <option value="rule">규칙</option>
              </select>
              <input
                type="date"
                value={metadata.effective_date}
                onChange={(e) =>
                  setMetadata({ ...metadata, effective_date: e.target.value })
                }
                placeholder="시행일자"
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-3">
              💡 파일은 자동으로 File Search Store에 업로드되어 AI 검색에 사용됩니다
            </p>
          </div>

          {/* Drop Zone */}
          <div
            className={`bg-white rounded-lg shadow p-12 border-2 border-dashed transition-all duration-200 ${
              dragging
                ? 'border-purple-500 bg-purple-50 scale-[1.02]'
                : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <svg
                className={`mx-auto h-16 w-16 transition-colors ${
                  dragging ? 'text-purple-500' : 'text-gray-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                조례 파일을 여기에 드래그하거나
              </h3>
              <label className="mt-4 inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-purple-800 cursor-pointer transition-all shadow-md hover:shadow-lg">
                📜 조례 파일 선택
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
              </label>
              <p className="mt-6 text-xs text-gray-500 leading-relaxed">
                <strong className="text-gray-700">지원 형식:</strong> PDF, HWP/HWPX, MD 파일
                <br />
                <strong className="text-gray-700">최대 용량:</strong> 파일당 2GB
              </p>
            </div>
          </div>
        </>
      )}

      {/* Upload List */}
      {uploads.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              Files ({uploads.length})
              {pendingCount > 0 && ` - ${pendingCount} pending`}
              {uploadingCount > 0 && ` - ${uploadingCount} uploading`}
              {completedCount > 0 && ` - ${completedCount} completed`}
              {failedCount > 0 && ` - ${failedCount} failed`}
            </h3>
            <div className="flex gap-2">
              <LogImport onImport={handleLogImport} />
              {completedCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm transition-colors"
                >
                  완료 항목 지우기
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  onClick={uploadAll}
                  disabled={uploadingCount > 0}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 text-sm transition-colors shadow-sm"
                >
                  전체 업로드 ({pendingCount})
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-md"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    {/* Status Icon */}
                    <div>
                      {upload.status === 'pending' && (
                        <div className="w-5 h-5 rounded-full bg-gray-300"></div>
                      )}
                      {(upload.status === 'uploading' ||
                        upload.status === 'indexing') && (
                        <div className="w-5 h-5 rounded-full border-2 border-purple-600 border-t-transparent animate-spin"></div>
                      )}
                      {upload.status === 'completed' && (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M5 13l4 4L19 7"></path>
                          </svg>
                        </div>
                      )}
                      {upload.status === 'failed' && (
                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {upload.file.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {(upload.file.size / 1024 / 1024).toFixed(2)} MB •{' '}
                        {upload.file.type || 'unknown type'}
                      </div>
                      {upload.error && (
                        <div className="text-xs text-red-600 mt-1">
                          Error: {upload.error}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {(upload.status === 'uploading' ||
                    upload.status === 'indexing') && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${upload.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div>
                  {upload.status === 'pending' && (
                    <button
                      onClick={() => removeUpload(upload.id)}
                      className="text-red-600 hover:text-red-900 text-sm font-medium"
                    >
                      제거
                    </button>
                  )}
                  {upload.status === 'failed' && (
                    <button
                      onClick={() => uploadFile(upload)}
                      className="text-purple-600 hover:text-purple-900 text-sm font-medium"
                    >
                      재시도
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
