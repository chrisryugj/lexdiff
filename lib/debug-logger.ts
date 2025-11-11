export type LogLevel = "info" | "success" | "warning" | "error" | "debug"

export interface LogEntry {
  id: string
  timestamp: Date
  level: LogLevel
  message: string
  details?: unknown
}

class DebugLogger {
  private logs: LogEntry[] = []
  private listeners: Set<(logs: LogEntry[]) => void> = new Set()
  private maxLogs = 500

  log(level: LogLevel, message: string, details?: unknown) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      level,
      message,
      details,
    }

    this.logs.unshift(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs)
    }

    console.log(`[v0] [${level.toUpperCase()}] ${message}`, details || "")
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
