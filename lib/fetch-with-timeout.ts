/**
 * 외부 API 호출용 공유 fetch 래퍼
 * - 타임아웃 기본 15초 (법제처 API hang 방지)
 * - Cascading failure 방지
 */

const DEFAULT_TIMEOUT_MS = 15_000

// 법제처 OPEN API가 Node 기본 UA(undici)를 봇으로 분류해 거부하므로
// 일반 브라우저 UA로 호출. LAW_USER_AGENT 환경변수로 override 가능.
const DEFAULT_USER_AGENT =
  process.env.LAW_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init || {}

  const headers = new Headers(fetchInit.headers)
  if (!headers.has("user-agent")) headers.set("user-agent", DEFAULT_USER_AGENT)

  // 이미 signal이 있으면 타임아웃과 합성
  if (fetchInit.signal) {
    return fetch(url, { ...fetchInit, headers })
  }

  return fetch(url, {
    ...fetchInit,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  })
}
