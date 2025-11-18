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

export default function FileUploadForm() {
  const [stores, setStores] = useState<FileSearchStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [uploads, setUploads] = useState<FileUploadItem[]>([]);
  const [metadata, setMetadata] = useState({
    law_name: '',
    article_number: '',
    law_type: 'law',
    effective_date: '',
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  async function fetchStores() {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      if (data.success) {
        setStores(data.stores);
        if (data.stores.length > 0) {
          setSelectedStore(data.stores[0].name);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch stores:', err);
    }
  }

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

    if (selectedStore) {
      formData.append('storeName', selectedStore);
    }

    // Add metadata if any field is filled
    if (
      metadata.law_name ||
      metadata.article_number ||
      metadata.effective_date
    ) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    try {
      // Update status to uploading
      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id ? { ...u, status: 'uploading', progress: 25 } : u
        )
      );

      const res = await fetch('/api/upload', {
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
                  result: data.file,
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
      {/* Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Upload Configuration</h3>

        {/* Target Store */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target Store (Optional)
          </label>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Files API Only (no indexing)</option>
            {stores.map((store) => (
              <option key={store.name} value={store.name}>
                {store.displayName || store.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Files uploaded to a store will be automatically indexed for search
          </p>
        </div>

        {/* Metadata */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Metadata (Optional)
          </label>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              value={metadata.law_name}
              onChange={(e) =>
                setMetadata({ ...metadata, law_name: e.target.value })
              }
              placeholder="Law Name (e.g., 관세법)"
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={metadata.article_number}
              onChange={(e) =>
                setMetadata({ ...metadata, article_number: e.target.value })
              }
              placeholder="Article Number (e.g., 38)"
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={metadata.law_type}
              onChange={(e) =>
                setMetadata({ ...metadata, law_type: e.target.value })
              }
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="law">Law (법률)</option>
              <option value="decree">Decree (시행령)</option>
              <option value="rule">Rule (시행규칙)</option>
              <option value="ordinance">Ordinance (조례)</option>
            </select>
            <input
              type="date"
              value={metadata.effective_date}
              onChange={(e) =>
                setMetadata({ ...metadata, effective_date: e.target.value })
              }
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        className={`bg-white rounded-lg shadow p-12 border-2 border-dashed transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Drag & Drop files here
          </h3>
          <p className="mt-1 text-sm text-gray-500">or</p>
          <label className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">
            Browse Files
            <input
              type="file"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </label>
          <p className="mt-4 text-xs text-gray-500">
            Supported: PDF, TXT, HTML, Images, Audio, Video, Code
            <br />
            Max file size: 2GB | Max storage: 20GB per project
          </p>
        </div>
      </div>

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
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                >
                  Clear Completed
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  onClick={uploadAll}
                  disabled={uploadingCount > 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 text-sm"
                >
                  Upload All ({pendingCount})
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
                        <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
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
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
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
                      className="text-red-600 hover:text-red-900 text-sm"
                    >
                      Remove
                    </button>
                  )}
                  {upload.status === 'failed' && (
                    <button
                      onClick={() => uploadFile(upload)}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      Retry
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
