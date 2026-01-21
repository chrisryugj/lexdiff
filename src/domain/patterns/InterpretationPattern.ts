/**
 * InterpretationPattern - 해석례 패턴 정의
 *
 * 행정해석, 법제처 해석, 유권해석, 예규, 고시, 훈령, 지침
 */

// 해석례 패턴
// NOTE: "법령.*해석" 패턴이 너무 광범위해서 "세금 해석이 궁금" 같은
// 자연어 질문도 해석례로 오분류됨 → 구체적 패턴으로 강화
export const INTERPRETATION_PATTERNS: RegExp[] = [
  /(행정해석|법제처\s*해석|유권해석)/,
  /(예규|고시|훈령|지침)/,
  // "법령 해석", "법령해석례", "법령 해석례" 등 구체적 매칭
  /법령\s*(해석례|해석)\b/,
  /해석례/
]

// 규칙 타입
export const RULE_TYPES = ['예규', '고시', '훈령', '지침'] as const
export type RuleType = typeof RULE_TYPES[number]

// 해석 타입
export const INTERPRETATION_TYPES = ['행정해석', '법제처 해석', '유권해석'] as const
export type InterpretationType = typeof INTERPRETATION_TYPES[number]
