import Link from 'next/link';
import StatsCard from '@/components/stats-card';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Gemini File Search 저장소 및 파일 관리 시스템
        </p>
      </div>

      {/* Stats */}
      <StatsCard />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/stores"
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                File Search Stores
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Store 목록 조회 및 관리
              </p>
            </div>
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
            </svg>
          </div>
        </Link>

        <Link
          href="/files"
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Files</h3>
              <p className="mt-2 text-sm text-gray-600">
                업로드된 파일 목록 및 관리
              </p>
            </div>
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
            </svg>
          </div>
        </Link>

        <Link
          href="/upload"
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Upload</h3>
              <p className="mt-2 text-sm text-gray-600">
                새 파일 업로드 및 인덱싱
              </p>
            </div>
            <svg
              className="w-8 h-8 text-purple-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
          </div>
        </Link>
      </div>

      {/* Documentation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          📚 Documentation
        </h3>
        <p className="text-sm text-blue-800 mb-4">
          Gemini File Search API 사용 방법 및 RAG 답변 생성 전략에 대한 완벽한
          가이드를 확인하세요.
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-blue-600">📖</span>
            <code className="text-blue-900 bg-blue-100 px-2 py-1 rounded">
              /docs/GEMINI_FILE_SEARCH_GUIDE.md
            </code>
            <span className="text-blue-700">- 완벽한 API 가이드</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-600">⚙️</span>
            <code className="text-blue-900 bg-blue-100 px-2 py-1 rounded">
              /admin/README.md
            </code>
            <span className="text-blue-700">- Admin UI 사용 가이드</span>
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          ✨ Key Features
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="font-medium text-gray-900">완전 관리형 RAG</div>
              <div className="text-sm text-gray-600">
                파일 저장, 청킹, 임베딩 자동 처리
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="font-medium text-gray-900">자동 인용</div>
              <div className="text-sm text-gray-600">
                답변에 사용된 문서 부분 자동 표시
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="font-medium text-gray-900">무료 저장/쿼리</div>
              <div className="text-sm text-gray-600">
                초기 인덱싱만 $0.15/1M 토큰
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="font-medium text-gray-900">환각 방지</div>
              <div className="text-sm text-gray-600">
                업로드된 문서만 사용하여 답변
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
