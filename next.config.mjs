/** @type {import('next').NextConfig} */
const nextConfig = {
  // korean-law-mcp의 네이티브 의존성(cfb, pdfjs-dist 등)을 서버사이드 번들링에서 제외
  serverExternalPackages: ['korean-law-mcp', 'kordoc', 'cfb', 'jszip'],
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
      // H-SEC3: CORS는 middleware.ts에서 origin 화이트리스트 echo 방식으로 처리.
      // 정적 헤더 방식은 단일 origin만 허용해 프리뷰/멀티 도메인 대응 불가.
    ]
  },
}

export default nextConfig
