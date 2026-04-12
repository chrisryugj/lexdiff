import { create } from "zustand"
import { debugLogger } from "./debug-logger"

export interface ErrorReport {
  id: string
  timestamp: string
  operation: string // 작업 종류 (검색, 법령 조회, 즐겨찾기 등)
  errorMessage: string
  errorStack?: string
  context: Record<string, unknown> // 에러 발생 시점의 상태
  apiLogs?: Array<{
    url: string
    method: string
    status?: number
    response?: string
  }>
}

interface ErrorReportStore {
  currentError: ErrorReport | null
  errorHistory: ErrorReport[]
  showErrorDialog: boolean
  reportError: (
    operation: string,
    error: Error,
    context?: Record<string, unknown>,
    apiLogs?: ErrorReport["apiLogs"],
  ) => void
  clearCurrentError: () => void
  getErrorReportText: (report: ErrorReport) => string
}

export const useErrorReportStore = create<ErrorReportStore>((set, get) => ({
  currentError: null,
  errorHistory: [],
  showErrorDialog: false,

  reportError: (operation, error, context = {}, apiLogs = []) => {
    const report: ErrorReport = {
      id: `error-${Date.now()}`,
      timestamp: new Date().toISOString(),
      operation,
      errorMessage: error.message,
      errorStack: error.stack,
      context: {
        ...context,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toLocaleString("ko-KR"),
      },
      apiLogs,
    }

    debugLogger.error("[error-report]", report)

    set((state) => ({
      currentError: report,
      errorHistory: [...state.errorHistory, report],
      showErrorDialog: true,
    }))
  },

  clearCurrentError: () => {
    set({ currentError: null, showErrorDialog: false })
  },

  getErrorReportText: (report) => {
    const lines = [
      "=== 버그 리포트 ===",
      "",
      `작업: ${report.operation}`,
      `시간: ${new Date(report.timestamp).toLocaleString("ko-KR")}`,
      `에러 ID: ${report.id}`,
      "",
      "=== 에러 메시지 ===",
      report.errorMessage,
      "",
    ]

    if (report.errorStack) {
      lines.push("=== 스택 트레이스 ===")
      lines.push(report.errorStack)
      lines.push("")
    }

    if (report.apiLogs && report.apiLogs.length > 0) {
      lines.push("=== API 호출 로그 ===")
      report.apiLogs.forEach((log, index) => {
        lines.push(`[${index + 1}] ${log.method} ${log.url}`)
        if (log.status) lines.push(`    상태: ${log.status}`)
        if (log.response) lines.push(`    응답: ${log.response.substring(0, 200)}...`)
      })
      lines.push("")
    }

    lines.push("=== 컨텍스트 ===")
    lines.push(JSON.stringify(report.context, null, 2))

    return lines.join("\n")
  },
}))
