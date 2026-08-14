export type LogLevel = "info" | "success" | "warning" | "error" | "debug"

export interface LogEntry {
  id: string
  timestamp: Date
  level: LogLevel
  message: string
  details?: unknown
}

// CWE-532: 로그에 실리는 URL의 API 크리덴셜(법제처 OC, Gemini key 등) 마스킹
function maskSecrets(value: string): string {
  return value
    .replace(/([?&](?:OC|key|apiKey|api_key|token)=)[^&\s"']+/gi, "$1***")
    .replace(/AIza[0-9A-Za-z_-]{30,}/g, "AIza***")
}

function maskValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return maskSecrets(value)
  if (depth >= 3 || value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((v) => maskValue(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = maskValue(v, depth + 1)
  }
  return out
}

class DebugLogger {
  private logs: LogEntry[] = []
  private listeners: Set<(logs: LogEntry[]) => void> = new Set()
  private maxLogs = 500

  log(level: LogLevel, message: string, details?: unknown) {
    const safeMessage = maskSecrets(message)
    const safeDetails = details === undefined ? undefined : maskValue(details)
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      level,
      message: safeMessage,
      details: safeDetails,
    }

    this.logs.unshift(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs)
    }

    // 프로덕션(Vercel Function 로그)에는 error/warning만 남긴다 — 크리덴셜 포함 URL 평문 기록 방지
    if (process.env.NODE_ENV !== "production" || level === "error" || level === "warning") {
      console.log(`[${level.toUpperCase()}] ${safeMessage}`, safeDetails ?? "")
    }
    this.notifyListeners()
  }

  info(message: string, details?: unknown) {
    this.log("info", message, details)
  }

  success(message: string, details?: unknown) {
    this.log("success", message, details)
  }

  warning(message: string, details?: unknown) {
    this.log("warning", message, details)
  }

  error(message: string, details?: unknown) {
    this.log("error", message, details)
  }

  debug(message: string, details?: unknown) {
    this.log("debug", message, details)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clear() {
    this.logs = []
    this.notifyListeners()
  }

  subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners() {
    // React 렌더링 사이클 밖에서 실행되도록 비동기 처리
    queueMicrotask(() => {
      this.listeners.forEach((listener) => listener(this.getLogs()))
    })
  }
}

export const debugLogger = new DebugLogger()
