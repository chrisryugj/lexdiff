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

**분류 기준 (엄격 적용)**:

critical(긴급) — 아래 중 하나라도 해당하면 critical:
1. 위임 근거 삭제/변경
2. 벌칙 신설/강화
3. 전부개정
4. 하위법령 3개 이상 영향
5. 조문/항/호의 신설 또는 삭제 (내용이 추가되거나 빠진 경우)
6. 정책·제도·대상·범위의 신설/확대/축소/폐지
7. 의무·권리·자격 요건의 실질적 변경
8. 조례 반영(개정)이 필요한 수준의 내용 변경

review(검토) — critical에 해당하지 않으면서 내용이 바뀐 경우:
1. 용어·명칭 변경 (의미 변화 없음)
2. 기준·수치의 소폭 조정
3. 조문 내 문구 수정이나 표현 변경 (규범 효과 동일)
4. 타법개정으로 인한 인용 조문 번호 변경

info(참고) — 실질적 내용 변경 없음:
1. 단순 자구 정비 (맞춤법, 띄어쓰기)
2. 조번호·항번호 이동 (내용 동일)
3. 부칙 경과규정
4. 시행일 변경만 있는 경우
5. 결격사유 조문으로 실질적 내용 변경 없음

**판단 원칙**: 구법과 신법을 비교하여 규범 효과(권리·의무·절차)가 달라지면 critical 우선 적용. 애매하면 상위 등급으로 분류.

변경사항:
${changesJson}

반드시 아래 JSON 배열 형식으로만 답변하세요. 다른 텍스트는 포함하지 마세요.

**reason 작성 규칙** (개조식, 명사형 종결):
- critical/review: 2문장. ①무엇이 어떻게 변경되었는지 + ②실무적 영향/필요 조치. 예: "저소득층 외 다자녀 양육자 우대 정책 추가 신설. 조례 내 우대 대상 범위 확대 반영 및 관련 예산 검토 필요"
- info: 1문장. 예: "결격사유 조문으로 실질적 내용 변경 없음 – 별도 조치 불필요"

[
  { "jo": "조문코드", "severity": "critical|review|info", "reason": "분류 근거" }
]`
}

/**
 * Gemini 폴백용 시스템 프롬프트
 */
export function buildClassificationSystemPrompt(): string {
  return `당신은 한국 법령 개정 영향도 분석 전문가입니다.
주어진 조문 변경사항을 분석하여 영향도를 critical/review/info로 분류합니다.
구법과 신법 텍스트를 면밀히 비교하여, 규범 효과(권리·의무·절차·대상·범위)가 달라지면 critical로 분류하세요.
애매한 경우 상위 등급으로 분류하세요 (under-classify보다 over-classify가 안전).
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
  const SEVERITY_LABEL: Record<string, string> = {
    critical: '🔴 긴급',
    review: '🟡 검토',
    info: '🟢 참고',
  }

  // 표를 프로그래밍으로 미리 생성 — AI가 등급을 바꿀 수 없음
  const sortedItems = [...items].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, review: 1, info: 2 }
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
  })

  const tableRows = sortedItems.map(item => {
    const label = SEVERITY_LABEL[item.severity] || '🟢 참고'
    const target = `${item.change.lawName} ${item.change.joDisplay}`
    return `| ${label} | ${target} | {{조치_설명}} |`
  }).join('\n')

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

위 결과를 바탕으로 종합 요약을 **마크다운** 형식으로 작성해주세요.

**반드시 아래 형식을 따르세요:**

## 법령 변경 영향 종합 요약 (${dateRange.from} ~ ${dateRange.to})

요약 설명을 개조식 불릿 리스트로 작성:
- 가장 주의해야 할 변경사항
- 하위법령 영향 (있는 경우)
- 기타 참고사항

그 다음 아래 표의 {{조치_설명}} 부분만 채워서 그대로 출력하세요.
**우선순위와 대상 컬럼은 절대 수정하지 마세요.** 있는 그대로 출력하세요.

| 우선순위 | 대상 | 조치 |
|----------|------|------|
${tableRows}

**문체 규칙 (필수)**:
- 모든 문장을 **개조식(명사형 종결)**으로 통일
- ✅ 올바른 예: "다자녀 양육자 우대 정책 추가로 조례 반영 검토 필요"
- ✅ 올바른 예: "현행 유지 조문으로 별도 조치 불필요"
- ❌ 금지: "~합니다", "~입니다", "~됩니다", "~필요합니다"
- 요약 설명도 개조식 불릿(-)으로만 작성. 서술형 문단 금지.

전체 5-10문장 이내로, 실무에 바로 활용 가능하게 작성하세요.`
}

/**
 * Gemini 폴백용 요약 시스템 프롬프트
 */
export function buildSummarySystemPrompt(): string {
  return `당신은 한국 법령 개정 영향 분석 보고서를 작성하는 전문가입니다.
주어진 분석 결과를 바탕으로 실무자에게 유용한 종합 요약을 작성합니다.
한국어로 간결하고 명확하게 답변하세요.`
}
