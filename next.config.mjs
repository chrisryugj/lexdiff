/** @type {import('next').NextConfig} */
const nextConfig = {
  // `eslint` top-level option removed in Next.js; ESLint handling should be done via CLI or separate config.
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Next.js 16: Turbopack이 기본값이므로 빈 설정으로 경고 제거
  turbopack: {},
}

export default nextConfig
