/**
 * AI 모델 설정 중앙화
 *
 * 모든 Gemini 모델 이름을 한 곳에서 관리.
 * 환경변수로 오버라이드 가능.
 */
export const AI_CONFIG = {
  gemini: {
    /** FC-RAG 엔진 등 주요 추론용 */
    primary: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    /** 조례 벤치마크, 분석 등 범용 */
    standard: process.env.GEMINI_STANDARD_MODEL || 'gemini-3-flash-preview',
    /** 요약, 별표 변환, 분류 등 경량 작업용 */
    lite: process.env.GEMINI_LITE_MODEL || 'gemini-3.1-flash-lite-preview',
  },
} as const
