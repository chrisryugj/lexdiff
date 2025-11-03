/** @type {import('next').NextConfig} */
const nextConfig = {
  // `eslint` top-level option removed in Next.js; ESLint handling should be done via CLI or separate config.
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
