import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'LexDiff Admin - Gemini File Search 관리',
  description: 'Google Gemini File Search Store 및 파일 관리 시스템',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center">
                  <Link href="/" className="text-xl font-bold text-gray-900">
                    LexDiff Admin
                  </Link>
                  <span className="ml-3 text-sm text-gray-500">
                    Gemini File Search 관리
                  </span>
                </div>
                <nav className="flex space-x-4">
                  <Link
                    href="/"
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    대시보드
                  </Link>
                  <Link
                    href="/stores"
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    Stores
                  </Link>
                  <Link
                    href="/files"
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  >
                    Files
                  </Link>
                  <Link
                    href="/upload"
                    className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Upload
                  </Link>
                </nav>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="bg-white border-t border-gray-200 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <p className="text-center text-sm text-gray-500">
                LexDiff Admin © 2025 - Powered by Google Gemini File Search
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
