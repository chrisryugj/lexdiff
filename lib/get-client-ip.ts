/**
 * Extract the client IP address from a request.
 * Checks Vercel-specific header first, then standard proxy headers,
 * falling back to 127.0.0.1 for local development.
 */
export function getClientIP(request: Request): string {
  const vercelIP = request.headers.get("x-vercel-forwarded-for")
  if (vercelIP) return vercelIP.split(",")[0].trim()

  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()

  const realIP = request.headers.get("x-real-ip")
  if (realIP) return realIP

  return "127.0.0.1"
}
