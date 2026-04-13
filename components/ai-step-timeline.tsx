"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "@/components/ui/icon"
import type { ToolCallLogEntry } from "@/components/search-result-view/types"

/** call/result 페어링 → 완료/진행 중 단계 목록 (사고 단계 포함) */
function buildSteps(logs: ToolCallLogEntry[], isStreaming = true) {
    const steps: Array<{
        name: string
        displayName: string
        query?: string
        status: 'completed' | 'in-progress'
        durationMs?: number
        success?: boolean
        summary?: string
        statusMessages: string[]
        isThinking?: boolean
    }> = []

    const statusBefore = new Map<number, string[]>()
    let pendingStatuses: string[] = []

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        if (log.type === 'status') {
            pendingStatuses.push(log.message || log.displayName)
        } else if (log.type === 'call') {
            statusBefore.set(i, [...pendingStatuses])
            pendingStatuses = []
        } else {
            pendingStatuses = []
        }
    }

    const calls = logs.map((l, i) => ({ ...l, _idx: i })).filter(l => l.type === 'call')
    const results = logs.filter(l => l.type === 'result')

    for (let ci = 0; ci < calls.length; ci++) {
        const call = calls[ci]
        const matchResult = results.find(r => r.name === call.name && r.timestamp && call.timestamp && r.timestamp >= call.timestamp)
        const msgs = statusBefore.get(call._idx) || []

        if (matchResult) {
            steps.push({
                name: call.name || '',
                displayName: call.displayName,
                query: call.query,
                status: 'completed',
                durationMs: (matchResult.timestamp! - call.timestamp!),
                success: matchResult.success,
                summary: matchResult.summary,
                statusMessages: msgs,
            })

            // 다음 tool_call까지의 "사고" 시간 — 1.5초 이상이면 별도 단계로 표시
            const nextCall = calls[ci + 1]
            if (nextCall && matchResult.timestamp && nextCall.timestamp) {
                const thinkingMs = nextCall.timestamp - matchResult.timestamp
                if (thinkingMs > 1500) {
                    steps.push({
                        name: 'thinking',
                        displayName: 'AI 분석 중',
                        status: 'completed',
                        durationMs: thinkingMs,
                        statusMessages: [],
                        isThinking: true,
                    })
                }
            }
            // 마지막 도구 결과 후 스트리밍 중이면 "사고 중" 표시
            else if (!nextCall && isStreaming && call.name !== 'generate_answer') {
                steps.push({
                    name: 'thinking',
                    displayName: 'AI 분석 중',
                    status: 'in-progress',
                    statusMessages: [],
                    isThinking: true,
                })
            }
        } else {
            steps.push({
                name: call.name || '',
                displayName: call.displayName,
                query: call.query,
                status: isStreaming ? 'in-progress' : 'completed',
                statusMessages: msgs,
            })
        }
    }

    // 도구 호출 없이 스트리밍 중일 때
    if (calls.length === 0 && isStreaming && logs.length > 0) {
        steps.push({
            name: 'waiting',
            displayName: '법령 데이터 수집 중',
            status: 'in-progress',
            statusMessages: [],
        })
    }

    const lastStatus = [...logs].reverse().find(l => l.type === 'status')
    return { steps, lastStatusMessage: lastStatus?.message || lastStatus?.displayName }
}

/** 실시간 경과 타이머 — 뱃지 스타일 */
function AiStepTimer() {
    const [elapsed, setElapsed] = useState(0)
    const startRef = useRef(Date.now())

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed((Date.now() - startRef.current) / 1000)
        }, 100)
        return () => clearInterval(interval)
    }, [])

    return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand-gold/10 ring-1 ring-brand-gold/20 text-brand-gold shrink-0">
            <Icon name="clock" className="h-2.5 w-2.5 opacity-80" />
            <span className="text-[10px] font-semibold tabular-nums leading-none">
                {elapsed.toFixed(1)}s
            </span>
        </span>
    )
}

/** 영향분석 스타일 단계별 타임라인 */
export function AiStepTimeline({ toolCallLogs, isStreaming }: { toolCallLogs: ToolCallLogEntry[], isStreaming: boolean }) {
    const { steps, lastStatusMessage } = useMemo(() => buildSteps(toolCallLogs, isStreaming), [toolCallLogs, isStreaming])

    return (
        <>
            {steps.map((step, i) => (
                <div key={`${step.name}-${i}`}>
                    <div className="flex items-center gap-2.5 text-sm">
                        {step.status === 'completed' ? (
                            step.isThinking ? (
                                <Icon name="brain" size={15} className="text-violet-400 shrink-0" />
                            ) : (
                                <Icon name="check-circle" size={15} className="text-emerald-500 shrink-0" />
                            )
                        ) : (
                            step.isThinking ? (
                                <Icon name="brain" size={15} className="text-violet-400 animate-pulse shrink-0" />
                            ) : (
                                <Icon name="loader" size={15} className="text-brand-gold animate-spin shrink-0" />
                            )
                        )}
                        <span className={`flex-1 truncate ${
                            step.status === 'completed'
                                ? step.isThinking
                                    ? 'text-violet-400 dark:text-violet-400'
                                    : 'text-gray-600 dark:text-gray-400'
                                : 'font-medium text-gray-800 dark:text-gray-200'
                        }`}>
                            {step.displayName}
                        </span>
                        {step.status === 'completed' && step.durationMs != null ? (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ring-1 shrink-0 ${
                                step.isThinking
                                    ? 'bg-violet-500/10 ring-violet-500/20 text-violet-500'
                                    : 'bg-muted ring-border text-muted-foreground'
                            }`}>
                                <Icon name="clock" className="h-2.5 w-2.5 opacity-80" />
                                <span className="text-[10px] font-semibold tabular-nums leading-none">
                                    {(step.durationMs / 1000).toFixed(1)}s
                                </span>
                            </span>
                        ) : step.status === 'in-progress' && isStreaming ? (
                            <AiStepTimer />
                        ) : null}
                    </div>
                    {step.status === 'in-progress' && isStreaming && lastStatusMessage && !step.isThinking && (
                        <div className="ml-[27px] text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {lastStatusMessage}
                        </div>
                    )}
                </div>
            ))}
        </>
    )
}
