/**
 * FC-RAG 엔진 소스 → 사용자 표시 라벨 (단일 진실 소스)
 *
 * 라이브 source 값은 route.ts 가 emit ('relay' | 'gemini').
 * 이 매핑이 여러 컴포넌트에 갈라져 있어 relay 가 'Gemini' 로 오표시되던 버그가 있었음 →
 * 라벨은 반드시 여기서만 결정한다. (client/server 양쪽 import 안전 — 의존성 없음)
 */
export function sourceLabel(source: string | undefined): string {
  switch (source) {
    case 'relay':
      return 'Themis' // 맥미니 구독 Claude + korean-law MCP 법령 엔진
    case 'gemini':
    default:
      return 'Gemini'
  }
}
