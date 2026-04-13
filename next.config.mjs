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
    // M2: LEXDIFF_CSP_NONCE=true 이면 middleware가 요청별 nonce CSP를 설정하므로
    // 정적 CSP는 제외 (중복 설정 방지). 그 외 보안 헤더는 유지.
    const cspNonceEnabled = process.env.LEXDIFF_CSP_NONCE === 'true'

    const baseHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ]

    if (!cspNonceEnabled) {
      // Supabase URL에서 호스트만 추출해 connect-src에 추가 (프로젝트별 서브도메인 대응)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
      const supabaseHost = supabaseUrl.replace(/\/+$/, '')

      baseHeaders.push({
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' https://www.law.go.kr https://lh3.googleusercontent.com https://*.googleusercontent.com data: blob:",
          `connect-src 'self' https://www.law.go.kr https://generativelanguage.googleapis.com https://vitals.vercel-insights.com https://vercel.live${supabaseHost ? ` ${supabaseHost}` : ''}`,
          "frame-ancestors 'self'",
          "font-src 'self' https://cdn.jsdelivr.net https://hangeul.pstatic.net data:",
        ].join('; ') + ';',
      })
    }

    return [
      {
        source: '/:path*',
        headers: baseHeaders,
      },
      // H-SEC3: CORS는 middleware.ts에서 origin 화이트리스트 echo 방식으로 처리.
    ]
  },
}

export default nextConfig
