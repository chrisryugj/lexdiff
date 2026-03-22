"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "@/components/ui/icon"
import type { ToolCallLogEntry } from "@/components/search-result-view/types"

/** call/result 페어링 → 완료/진행 중 단계 목록 */
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

    for (const call of calls) {
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

/** 실시간 경과 타이머 */
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
        <span className="text-xs text-brand-gold tabular-nums shrink-0">
            {elapsed.toFixed(1)}초
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
                            <Icon name="check-circle" size={15} className="text-emerald-500 shrink-0" />
                        ) : (
                            <Icon name="loader" size={15} className="text-brand-gold animate-spin shrink-0" />
                        )}
                        <span className={`flex-1 truncate ${
                            step.status === 'completed'
                                ? 'text-gray-600 dark:text-gray-400'
                                : 'font-medium text-gray-800 dark:text-gray-200'
                        }`}>
                            {step.displayName}
                        </span>
                        {step.status === 'completed' && step.durationMs != null ? (
                            <span className="text-xs text-gray-400 tabular-nums shrink-0">
                                {(step.durationMs / 1000).toFixed(1)}초
                            </span>
                        ) : step.status === 'in-progress' && isStreaming ? (
                            <AiStepTimer />
                        ) : null}
                    </div>
                    {step.status === 'in-progress' && isStreaming && lastStatusMessage && (
                        <div className="ml-[27px] text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {lastStatusMessage}
                        </div>
                    )}
                </div>
            ))}
        </>
    )
}
