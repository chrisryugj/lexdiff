"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { debugLogger, type LogEntry, type LogLevel } from "@/lib/debug-logger"
import {
  Terminal,
  Trash2,
  ChevronDown,
  ChevronUp,
  Filter,
  Copy,
  Check,
} from "lucide-react"

export function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all")
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = debugLogger.subscribe(setLogs)
    setLogs(debugLogger.getLogs())
    return unsubscribe
  }, [])

  const filteredLogs = filterLevel === "all" ? logs : logs.filter((log) => log.level === filterLevel)

  const getLevelColor = (level: LogLevel): string => {
    switch (level) {
      case "info":
        return "bg-[var(--color-info)] text-white"
      case "success":
        return "bg-[var(--color-success)] text-white"
      case "warning":
        return "bg-[var(--color-warning)] text-black"
      case "error":
        return "bg-[var(--color-destructive)] text-white"
      case "debug":
        return "bg-muted text-muted-foreground"
    }
  }

  const getLevelIcon = (level: LogLevel): string => {
    switch (level) {
      case "info":
        return "ℹ️"
      case "success":
        return "✓"
      case "warning":
        return "⚠"
      case "error":
        return "✕"
      case "debug":
        return "◆"
    }
  }

  const copyLog = async (entry: LogEntry) => {
    try {
      const header = `[#${entry.level.toUpperCase()}] ${entry.timestamp.toISOString()} - ${entry.message}`
      const details = entry.details ? `\n${JSON.stringify(entry.details, null, 2)}` : ""
      await navigator.clipboard.writeText(`${header}${details}`)
      setCopiedLogId(entry.id)
      setTimeout(() => {
        setCopiedLogId((current) => (current === entry.id ? null : current))
      }, 2000)
    } catch (error) {
      debugLogger.error("로그 복사에 실패했습니다", { error: (error as Error)?.message })
    }
  }

  return (
    <Card className="fixed bottom-0 left-0 right-0 z-50 rounded-none border-t-2 border-[var(--color-debug-border)] bg-[var(--color-debug-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--color-debug-border)] px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="font-mono text-sm font-semibold text-foreground">디버그 콘솔</span>
          <Badge variant="outline" className="font-mono text-xs">
            {filteredLogs.length} logs
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as LogLevel | "all")}
              className="bg-secondary text-secondary-foreground border-border rounded px-2 py-1 text-xs font-mono"
            >
              <option value="all">전체</option>
              <option value="info">정보</option>
              <option value="success">성공</option>
              <option value="warning">경고</option>
              <option value="error">오류</option>
              <option value="debug">디버그</option>
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => debugLogger.clear()} className="h-7 px-2">
            <Trash2 className="h-3 w-3" />
          </Button>
          {isExpanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-7 px-2"
              title={isMinimized ? "확장" : "최소화"}
            >
              {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 px-2"
            title={isExpanded ? "접기" : "펼치기"}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <ScrollArea className={isMinimized ? "h-24" : "h-64"}>
          <div className="space-y-1 p-2">
            {filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">로그가 없습니다</div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 rounded border border-border/50 bg-card/50 p-2 font-mono text-xs hover:bg-card/80"
                >
                  <Badge className={`${getLevelColor(log.level)} shrink-0 px-1.5 py-0 text-[10px]`}>
                    {getLevelIcon(log.level)} {log.level.toUpperCase()}
                  </Badge>
                  <span className="text-muted-foreground shrink-0">{log.timestamp.toLocaleTimeString("ko-KR")}</span>
                  <span className="flex-1 text-foreground break-words whitespace-pre-wrap">{log.message}</span>
                  {log.details && (
                    <details className="text-muted-foreground shrink-0">
                      <summary className="cursor-pointer text-[10px]">상세</summary>
                      <pre className="mt-1 text-[10px] whitespace-pre-wrap break-words max-w-md">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => copyLog(log)}
                    title="로그 복사"
                  >
                    {copiedLogId === log.id ? <Check className="h-3 w-3 text-[var(--color-success)]" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </Card>
  )
}
