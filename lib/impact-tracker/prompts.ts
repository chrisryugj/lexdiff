/**
 * 영향 추적기 AI 프롬프트 빌더
 *
 * OpenClaw와 Gemini 모두에서 사용 가능한 범용 프롬프트.
 * OpenClaw: NL 쿼리로 전송 → 답변에서 JSON 추출
 * Gemini: 시스템 프롬프트 + 사용자 프롬프트로 분리
 */

import type { ClassificationInput, ImpactItem } from './types'

// ── 영향도 분류 ──

/**
 * 영향도 분류 프롬프트 (OpenClaw/Gemini 공용)
 * changes를 JSON으로 직렬화하여 구조화된 분석 요청
 */
export function buildClassificationQuery(changes: ClassificationInput[]): string {
  const changesJson = JSON.stringify(
    changes.map(c => {
      const entry: Record<string, unknown> = {
        jo: c.jo,
        조문: c.joDisplay,
        법령: c.lawName,
        개정유형: c.revisionType,
        하위법령수: c.downstreamCount,
        구법: c.oldText?.slice(0, 500) || '(없음)',
        신법: c.newText?.slice(0, 500) || '(없음)',
      }
      if (c.referencingOrdinance) {
        entry.참조조례 = c.referencingOrdinance.ordinanceName
        entry.영향받는조례조문 = c.referencingOrdinance.ordinanceArticles.join(', ')
      }
      return entry
    }),
    null,
    2,
  )

  return `다음 법령 조문 변경사항의 영향도를 분류해주세요.

분류 기준:
- critical(긴급): 위임 근거 삭제/변경, 벌칙 신설/강화, 전부개정, 하위법령 3개 이상 영향, 조례가 직접 참조하는 조문의 실질적 변경
- review(검토): 용어 변경, 기준/수치 수정, 일부개정으로 실질적 내용 변경, 조례 참조 조문의 형식적 변경
- info(참고): 단순 자구 정비, 조번호 이동, 부칙 변경, 형식적 수정

변경사항:
${changesJson}

반드시 아래 JSON 배열 형식으로만 답변하세요. 다른 텍스트는 포함하지 마세요.
[
  { "jo": "조문코드", "severity": "critical|review|info", "reason": "분류 근거 1-2문장" }
]`
}

/**
 * Gemini 폴백용 시스템 프롬프트
 */
export function buildClassificationSystemPrompt(): string {
  return `당신은 한국 법령 개정 영향도 분석 전문가입니다.
주어진 조문 변경사항을 분석하여 영향도를 critical/review/info로 분류합니다.
반드시 JSON 배열만 반환하세요. 마크다운이나 설명 텍스트를 포함하지 마세요.`
}

// ── 종합 요약 ──

/**
 * 종합 요약 프롬프트 (OpenClaw/Gemini 공용)
 */
export function buildSummaryQuery(
  items: ImpactItem[],
  dateRange: { from: string; to: string },
): string {
  const summary = items.map(item => ({
    법령: item.change.lawName,
    조문: item.change.joDisplay,
    등급: item.severity,
    개정유형: item.change.revisionType,
    하위법령: item.downstreamImpacts.length,
    근거: item.severityReason,
  }))

  return `다음은 ${dateRange.from} ~ ${dateRange.to} 기간의 법령 변경 영향 분석 결과입니다.

분석 결과:
${JSON.stringify(summary, null, 2)}

위 결과를 바탕으로 종합 요약을 작성해주세요:
1. 가장 주의해야 할 변경사항 (긴급 등급 중심)
2. 하위법령에 미치는 전체적 영향
3. 실무자가 취해야 할 조치 권고

3-5문장으로 간결하게 작성하세요.`
}

/**
 * Gemini 폴백용 요약 시스템 프롬프트
 */
export function buildSummarySystemPrompt(): string {
  return `당신은 한국 법령 개정 영향 분석 보고서를 작성하는 전문가입니다.
주어진 분석 결과를 바탕으로 실무자에게 유용한 종합 요약을 작성합니다.
한국어로 간결하고 명확하게 답변하세요.`
}
