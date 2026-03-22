/**
 * FC-RAG Engine - Function Calling 기반 RAG 엔진
 *
 * korean-law-mcp 도구를 LLM Function Calling으로 호출하여
 * 법제처 API 실시간 데이터 기반 답변 생성.
 *
 * ── LLM 구성 ──
 * Primary : Sonnet 4.6 (Claude) — CLI subprocess (stream-json 모드)
 *           로컬: claude.exe 직접 spawn / Vercel: OpenClaw Bridge 프록시
 * Fallback: Gemini Flash — Claude 불능 시 이 엔진이 직접 Gemini 호출
 *
 * 도구 어댑터(tool-adapter), Tier 시스템(tool-tiers), 프롬프트(prompts)는
 * 양쪽 LLM이 공유하는 인프라.
 *
 * SSE 스트리밍 지원: executeClaudeRAGStream() / executeGeminiRAGStream()
 *
 * ── 모듈 구조 ──
 * engine-shared.ts  : 타입, 설정, 유틸, 대화 컨텍스트, Fast Path, 질의 분류
 * claude-engine.ts  : Claude Primary 엔진 (CLI subprocess)
 * gemini-engine.ts  : Gemini Fallback 엔진 (멀티턴 FC)
 * engine.ts (이 파일) : Re-export 허브 + 비스트리밍 래퍼
 */

// ── 타입/유틸 re-export ──
export type { LegalQueryType } from './engine-shared'
export type { FCRAGCitation, FCRAGResult, FCRAGStreamEvent, RAGStreamOptions } from './engine-shared'
export { inferComplexity, inferQueryType } from './engine-shared'

// ── Re-export for external consumers ──
export { KNOWN_MST } from './fast-path'

// ── 엔진 re-export ──
export { executeClaudeRAGStream } from './claude-engine'
export { executeGeminiRAGStream } from './gemini-engine'

/** @deprecated route.ts에서 직접 executeClaudeRAGStream/executeGeminiRAGStream 사용 */
export { executeGeminiRAGStream as executeRAGStream } from './gemini-engine'

/**
 * FC-RAG 실행 (비스트리밍 버전)
 * Claude 우선, 실패 시 Gemini fallback
 */
export async function executeRAG(
  query: string,
  geminiApiKey?: string,
): Promise<import('./engine-shared').FCRAGResult> {
  const { executeClaudeRAGStream } = await import('./claude-engine')
  const { executeGeminiRAGStream } = await import('./gemini-engine')

  // Claude 우선
  try {
    for await (const event of executeClaudeRAGStream(query)) {
      if (event.type === 'answer') return event.data
      if (event.type === 'error') throw new Error(event.message)
    }
  } catch {
    // Claude 실패 → Gemini fallback
  }
  for await (const event of executeGeminiRAGStream(query, { apiKey: geminiApiKey })) {
    if (event.type === 'answer') return event.data
    if (event.type === 'error') throw new Error(event.message)
  }
  throw new Error('답변이 생성되지 않았습니다.')
}
