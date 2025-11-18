'use client';

import { useEffect, useState } from 'react';
import type { GeminiFile } from '@/lib/types';

export default function FileList() {
  const [files, setFiles] = useState<GeminiFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(100);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    fetchFiles();
  }, [currentPage, search]);

  useEffect(() => {
    // Track scroll position
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;

      setIsAtTop(scrollTop < 100);
      setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 100);
      setShowScrollButtons(scrollTop > 300 || scrollTop + clientHeight < scrollHeight - 300);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial position

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function fetchFiles() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
      });

      if (search) {
        params.set('search', search);
      }

      const res = await fetch(`/api/files?${params}`);
      const data = await res.json();

      if (data.success) {
        setFiles(data.files);
        setTotal(data.total);
        setTotalPages(data.totalPages || 1);
      } else {
        setError(data.error || 'Failed to load files');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setCurrentPage(1);
    setSearch(searchInput);
  }

  async function deleteFile(fileName: string) {
    const confirmed = confirm(`Delete file "${fileName}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/files/${extractFileId(fileName)}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        alert(data.message);
        await fetchFiles();
        setSelectedFiles(new Set());
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }

  async function deleteSelected() {
    if (selectedFiles.size === 0) {
      alert('No files selected');
      return;
    }

    const confirmed = confirm(`Delete ${selectedFiles.size} selected files?`);
    if (!confirmed) return;

    setDeleting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const fileName of Array.from(selectedFiles)) {
      try {
        const res = await fetch(`/api/files/${extractFileId(fileName)}`, {
          method: 'DELETE',
        });

        const data = await res.json();

        if (data.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    alert(`Deleted ${successCount} files. ${errorCount} errors.`);
    setDeleting(false);
    setSelectedFiles(new Set());
    await fetchFiles();
  }

  function extractFileId(fileName: string): string {
    const parts = fileName.split('/');
    return parts[parts.length - 1];
  }

  function formatBytes(bytes?: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  function formatTimeRemaining(expirationTime?: string): string {
    if (!expirationTime) return 'Unknown';

    const expiry = new Date(expirationTime);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();

    if (diff < 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  function toggleSelectAll() {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.name)));
    }
  }

  function toggleSelect(fileName: string) {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileName)) {
      newSelected.delete(fileName);
    } else {
      newSelected.add(fileName);
    }
    setSelectedFiles(newSelected);
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollToBottom() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
        <p className="mt-4 text-gray-500">Loading files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchFiles}
          className="mt-2 text-sm text-red-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalSize = files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Documents ({total.toLocaleString()})
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Page {currentPage} of {totalPages} • Total: {formatBytes(totalSize)} / 20 GB
          </p>
        </div>
        <div className="flex gap-2">
          {selectedFiles.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
            >
              {deleting
                ? 'Deleting...'
                : `Delete Selected (${selectedFiles.size})`}
            </button>
          )}
          <button
            onClick={fetchFiles}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search documents..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Files Table */}
      {files.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">No files found</p>
          <p className="text-gray-400 text-sm mt-2">
            {search ? 'Try a different search query' : 'Upload files to get started'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedFiles.size === files.length}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      MIME Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {files.map((file) => (
                    <tr key={file.name} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.name)}
                          onChange={() => toggleSelect(file.name)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {file.displayName || 'Unnamed'}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">
                          {file.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatBytes(file.sizeBytes)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100">
                          {file.mimeType?.split('/')[1] || 'unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(() => {
                          const remaining = formatTimeRemaining(
                            file.expirationTime
                          );
                          const isExpiringSoon =
                            file.expirationTime &&
                            new Date(file.expirationTime).getTime() -
                              new Date().getTime() <
                              24 * 60 * 60 * 1000;

                          return (
                            <span
                              className={
                                remaining === 'Expired'
                                  ? 'text-red-600'
                                  : isExpiringSoon
                                  ? 'text-orange-600'
                                  : 'text-gray-500'
                              }
                            >
                              {remaining}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            file.state === 'ACTIVE'
                              ? 'bg-green-100 text-green-800'
                              : file.state === 'PROCESSING'
                              ? 'bg-yellow-100 text-yellow-800'
                              : file.state === 'FAILED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {file.state || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => deleteFile(file.name)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-500">
                Showing {(currentPage - 1) * limit + 1} to{' '}
                {Math.min(currentPage * limit, total)} of {total.toLocaleString()}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-4 py-2 bg-gray-100 rounded-md">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Floating Scroll Buttons */}
      {showScrollButtons && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
          {!isAtTop && (
            <button
              onClick={scrollToTop}
              className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
              aria-label="Scroll to top"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            </button>
          )}
          {!isAtBottom && (
            <button
              onClick={scrollToBottom}
              className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
              aria-label="Scroll to bottom"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
