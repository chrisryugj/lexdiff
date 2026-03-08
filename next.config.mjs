/** @type {import('next').NextConfig} */
const nextConfig = {
  // `eslint` top-level option removed in Next.js; ESLint handling should be done via CLI or separate config.
  images: {
    unoptimized: true,
  },
  // Next.js 16: Turbopack이 기본값이므로 빈 설정으로 경고 제거
  turbopack: {},

  // 보안 헤더
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://www.law.go.kr data: blob:; connect-src 'self' https://www.law.go.kr https://generativelanguage.googleapis.com; frame-ancestors 'self'; font-src 'self' https://cdn.jsdelivr.net https://hangeul.pstatic.net data:;",
          },
        ],
      },
      {
        // API 라우트 CORS 제한
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_SITE_URL || 'https://lexdiff.vercel.app',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, X-User-API-Key',
          },
        ],
      },
    ]
  },
}

export default nextConfig
