/**
 * FC-RAG 법령 질의 로그 — NDJSON 파일 저장
 *
 * 로컬(미니PC) 환경에서만 동작. Vercel은 ephemeral fs이므로 스킵.
 * logs/fc-rag-queries.jsonl에 한 줄씩 append.
 * jq, grep으로 바로 분석 가능.
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const LOG_DIR = join(process.cwd(), 'logs')
const LOG_FILE = join(LOG_DIR, 'fc-rag-queries.jsonl')

export interface QueryLogEntry {
  ts: string
  traceId: string
  query: string
  source: 'claude' | 'gemini'
  env: 'local' | 'vercel'
  complexity: string
  queryType: string
  durationMs: number
  tools: string[]
  answerLength: number
  citationCount: number
  verifiedCount: number
  error: string | null
}

/** 질의 로그 한 줄 append. Vercel 환경이면 스킵. */
export function appendQueryLog(entry: QueryLogEntry): void {
  if (process.env.VERCEL) return
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  } catch { /* 로깅 실패는 무시 — 질의 처리에 영향 주지 않음 */ }
}
