/**
 * PII 스크러빙 — 사용자 질의 저장 직전 민감정보 마스킹.
 *
 * 수집 목적이 아니라 "사용자가 실수로 입력한 민감정보"를 방어하는 안전장치.
 * 개인정보보호법 대응: 이름 패턴은 false positive가 많아 제외하고,
 * 확정적으로 식별 가능한 패턴만 마스킹한다.
 */

const PATTERNS: Array<{ name: string; re: RegExp; mask: string }> = [
  // 주민등록번호: 6자리-7자리 (가운데 하이픈/공백 허용)
  { name: 'rrn', re: /\b\d{6}[- ]?[1-4]\d{6}\b/g, mask: '[RRN]' },
  // 외국인등록번호: 동일 포맷, 뒷자리 첫 숫자 5-8
  { name: 'frn', re: /\b\d{6}[- ]?[5-8]\d{6}\b/g, mask: '[FRN]' },
  // 사업자등록번호: 3-2-5
  { name: 'brn', re: /\b\d{3}-\d{2}-\d{5}\b/g, mask: '[BRN]' },
  // 법인등록번호: 6-7
  { name: 'crn', re: /\b\d{6}-\d{7}\b/g, mask: '[CRN]' },
  // 한국 휴대폰: 010/011/016/017/018/019
  { name: 'phone', re: /\b01[016-9][- ]?\d{3,4}[- ]?\d{4}\b/g, mask: '[PHONE]' },
  // 일반 전화: 02/0XX-XXXX-XXXX
  { name: 'tel', re: /\b0(?:2|[3-6][1-5]|70)[- ]?\d{3,4}[- ]?\d{4}\b/g, mask: '[TEL]' },
  // 이메일
  { name: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, mask: '[EMAIL]' },
  // 계좌번호 (10~16자리 연속 숫자, 하이픈 허용) — 법령 조번호와 충돌 피하려 최소 10자리
  { name: 'account', re: /\b\d{3,6}[- ]\d{2,6}[- ]\d{4,7}\b/g, mask: '[ACCOUNT]' },
  // 신용카드: 16자리 (4-4-4-4)
  { name: 'card', re: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g, mask: '[CARD]' },
  // IPv4
  { name: 'ipv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, mask: '[IP]' },
]

export interface ScrubResult {
  scrubbed: string
  hits: Record<string, number>
}

export function scrubPII(input: string): ScrubResult {
  if (!input) return { scrubbed: '', hits: {} }
  let out = input
  const hits: Record<string, number> = {}
  for (const { name, re, mask } of PATTERNS) {
    let count = 0
    out = out.replace(re, () => {
      count += 1
      return mask
    })
    if (count > 0) hits[name] = count
  }
  return { scrubbed: out, hits }
}
