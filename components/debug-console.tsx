"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { debugLogger, type LogEntry, type LogLevel } from "@/lib/debug-logger"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/hooks/use-toast"

export function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all")
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { toast } = useToast()

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

  const toggleLogExpand = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) {
        next.delete(logId)
      } else {
        next.add(logId)
      }
      return next
    })
  }

  const copyLog = async (log: LogEntry) => {
    const logText = `[${log.level.toUpperCase()}] ${log.timestamp.toLocaleString("ko-KR")}
${log.message}${log.details ? `\n\n상세 정보:\n${JSON.stringify(log.details, null, 2)}` : ""}`

    try {
      await navigator.clipboard.writeText(logText)
      setCopiedId(log.id)
      setTimeout(() => setCopiedId(null), 2000)
      toast({
        title: "복사 완료",
        description: "로그가 클립보드에 복사되었습니다.",
      })
    } catch (error) {
      toast({
        title: "복사 실패",
        description: "로그 복사 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    }
  }

  if (isCollapsed) {
    return (
      <Button
        onClick={() => setIsCollapsed(false)}
        className="fixed bottom-4 left-4 z-50 h-10 w-10 rounded-full shadow-lg"
        size="icon"
        title="디버그 콘솔 열기"
      >
        <Icon name="terminal" className="h-5 w-5" />
        {logs.length > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
            {logs.length}
          </Badge>
        )}
      </Button>
    )
  }

  return (
    <Card className="fixed bottom-0 left-0 right-0 z-50 rounded-none border-t-2 border-[var(--color-debug-border)] bg-[var(--color-debug-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--color-debug-border)] px-4 py-2">
        <div className="flex items-center gap-2">
          <Icon name="terminal" className="h-4 w-4 text-primary" />
          <span className="font-mono text-sm font-semibold text-foreground">디버그 콘솔</span>
          <Badge variant="outline" className="font-mono text-xs">
            {filteredLogs.length} logs
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Icon name="filter" className="h-3 w-3 text-muted-foreground" />
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
            <Icon name="trash" className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(true)}
            className="h-7 px-2"
            title="좌측 하단으로 축소"
          >
            <Icon name="maximize" className="h-4 w-4" />
          </Button>
          {isExpanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-7 px-2"
              title={isMinimized ? "확장" : "최소화"}
            >
              <Icon name={isMinimized ? "chevron-up" : "chevron-down"} className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 px-2"
            title={isExpanded ? "접기" : "펼치기"}
          >
            <Icon name={isExpanded ? "chevron-down" : "chevron-up"} className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <ScrollArea className={isMinimized ? "h-24" : "h-64"}>
          <div className="space-y-1 p-2">
            {filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">로그가 없습니다</div>
            ) : (
              filteredLogs.map((log) => {
                const isExpanded = expandedLogs.has(log.id)
                const hasDetails = !!log.details

                return (
                  <div
                    key={log.id}
                    className="rounded border border-border/50 bg-card/50 p-2 font-mono text-xs hover:bg-card/80 transition-colors"
                  >
                    <div
                      className={`flex items-start gap-2 ${hasDetails ? "cursor-pointer" : ""}`}
                      onClick={() => hasDetails && toggleLogExpand(log.id)}
                    >
                      <Badge className={`${getLevelColor(log.level)} shrink-0 px-1.5 py-0 text-[10px]`}>
                        {getLevelIcon(log.level)}
                      </Badge>
                      <span className="text-muted-foreground shrink-0 text-[10px]">
                        {log.timestamp.toLocaleTimeString("ko-KR")}
                      </span>
                      <span className="flex-1 text-foreground break-words">{log.message}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            copyLog(log)
                          }}
                          className="h-5 w-5 p-0"
                          title="로그 복사"
                        >
                          {copiedId === log.id ? (
                            <Icon name="check" className="h-3 w-3 text-green-500" />
                          ) : (
                            <Icon name="copy" className="h-3 w-3" />
                          )}
                        </Button>
                        {hasDetails && (
                          <div className="text-muted-foreground">
                            <Icon name={isExpanded ? "chevron-up" : "chevron-down"} className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                    </div>

                    {hasDetails && isExpanded && (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <div className="text-[10px] text-muted-foreground mb-1">상세 정보:</div>
                        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/30 p-2 rounded">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      )}
    </Card>
  )
}
