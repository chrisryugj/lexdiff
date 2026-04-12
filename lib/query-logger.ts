/**
 * FC-RAG 법령 질의 로그 — NDJSON 파일 저장
 *
 * 로컬 환경에서만 동작. Vercel은 ephemeral fs이므로 스킵.
 * logs/fc-rag-queries.jsonl에 한 줄씩 append.
 * Hermes 대시보드에서 읽을 수 있도록 ~/.hermes/logs/에도 동시 기록.
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const LOG_DIR = join(process.cwd(), 'logs')
const LOG_FILE = join(LOG_DIR, 'fc-rag-queries.jsonl')

// Hermes 대시보드 연동: ~/.hermes/logs/ 에 동일 로그 기록 (로컬 전용)
const HERMES_LOG_DIR = process.env.HOME ? join(process.env.HOME, '.hermes', 'logs') : null
const HERMES_LOG_FILE = HERMES_LOG_DIR ? join(HERMES_LOG_DIR, 'fc-rag-queries.jsonl') : null

export interface QueryLogEntry {
  ts: string
  traceId: string
  query: string
  source: 'hermes' | 'gemini'
  model?: string
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

// PII 마스킹: 주민등록번호, 전화번호, 이메일, 카드번호
function maskPII(text: string): string {
  if (!text) return text
  return text
    .replace(/\b\d{6}-?[1-4]\d{6}\b/g, '[RRN]')
    .replace(/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[PHONE]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, (m) => (m.replace(/[^\d]/g, '').length >= 13 ? '[CARD]' : m))
}

function sanitizeEntry(entry: QueryLogEntry): QueryLogEntry {
  const cleaned = maskPII(entry.query || '')
  // 추가 안전: 너무 긴 질의는 1000자로 절단 (디스크/네트워크 오용 방지)
  const truncated = cleaned.length > 1000 ? cleaned.slice(0, 1000) + '…' : cleaned
  return { ...entry, query: truncated }
}

/** 질의 로그 append. 로컬: 파일, Vercel: Hermes API로 전송. */
export function appendQueryLog(entry: QueryLogEntry): void {
  const safe = sanitizeEntry(entry)
  const line = JSON.stringify(safe) + '\n'

  if (process.env.VERCEL) {
    // Vercel: Hermes API로 로그 전송 (fire-and-forget) — https + 키 모두 필수
    const hermesUrl = process.env.HERMES_API_URL
    const hermesKey = process.env.HERMES_API_KEY
    if (hermesUrl && hermesKey && hermesUrl.startsWith('https://')) {
      fetch(`${hermesUrl}/api/fc-rag-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hermesKey}`,
        },
        body: line,
      }).catch(() => {})
    }
    return
  }

  // 로컬: 파일 저장
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, line)
  } catch { /* 로깅 실패는 무시 */ }
  // Hermes 대시보드용 동시 기록
  if (HERMES_LOG_DIR && HERMES_LOG_FILE) {
    try {
      if (!existsSync(HERMES_LOG_DIR)) mkdirSync(HERMES_LOG_DIR, { recursive: true })
      appendFileSync(HERMES_LOG_FILE, line)
    } catch { /* Hermes 미설치 시 무시 */ }
  }
}
