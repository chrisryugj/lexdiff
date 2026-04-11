/**
 * Next.js Instrumentation — 서버 시작 시 최초 1회 실행.
 * korean-law-mcp/tools/annex가 pdfjs-dist를 통해 DOMMatrix를 참조하므로
 * Vercel serverless 환경에서 모듈 로드 전에 폴리필 필요.
 */
export function register() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // @ts-expect-error minimal stub for pdfjs-dist compatibility
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() { return Object.create(null) }
    }
  }
}
