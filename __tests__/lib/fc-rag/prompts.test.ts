import { describe, test, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/fc-rag/prompts'

describe('buildSystemPrompt', () => {
  describe('complexity별 길이 힌트', () => {
    test('simple → 500자', () => {
      const prompt = buildSystemPrompt('simple', 'definition')
      expect(prompt).toContain('500자 이내')
    })

    test('moderate → 1000자', () => {
      const prompt = buildSystemPrompt('moderate', 'application')
      expect(prompt).toContain('1000자 이내')
    })

    test('complex → 2000자', () => {
      const prompt = buildSystemPrompt('complex', 'comparison')
      expect(prompt).toContain('2000자 이내')
    })
  })

  describe('queryType별 specialist 지침 포함', () => {
    test('definition → 정의 + 헷갈리는 개념 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'definition')
      expect(prompt).toContain('쉽게 풀어 설명')
      expect(prompt).toContain('헷갈리는 개념')
    })

    test('requirement → 결격사유 + 필수 요건 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'requirement')
      expect(prompt).toContain('결격사유')
      expect(prompt).toContain('필수 요건')
    })

    test('procedure → 로드맵 + 기한/제출처 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'procedure')
      expect(prompt).toContain('로드맵')
      expect(prompt).toContain('기한/제출처/필수서류/비용')
    })

    test('comparison → A vs B + 비교표 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'comparison')
      expect(prompt).toContain('A vs B')
      expect(prompt).toContain('비교표')
    })

    test('application → 적용됨/안됨 + 확신도 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'application')
      expect(prompt).toContain('적용됨/안됨/보류')
      expect(prompt).toContain('확신도')
    })

    test('consequence → 예상 조치 + 구제 방법 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'consequence')
      expect(prompt).toContain('징역/벌금/과태료')
      expect(prompt).toContain('구제 방법')
    })

    test('scope → 산정 기준 + 시뮬레이션 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'scope')
      expect(prompt).toContain('산정 기준')
      expect(prompt).toContain('시뮬레이션')
    })

    test('exemption → 혜택 적용 + 요건 체크 구조', () => {
      const prompt = buildSystemPrompt('moderate', 'exemption')
      expect(prompt).toContain('혜택 적용 가능성')
      expect(prompt).toContain('요건 체크')
    })
  })

  describe('공통 규칙 포함', () => {
    test('범용 독자 (하드코딩 없음)', () => {
      const prompt = buildSystemPrompt('simple', 'application')
      expect(prompt).not.toContain('무역')
      expect(prompt).not.toContain('관세 실무자')
      expect(prompt).not.toContain('지자체 공무원')
      expect(prompt).toContain('비전문가')
    })

    test('간결체 지시', () => {
      const prompt = buildSystemPrompt('moderate', 'definition')
      expect(prompt).toContain('간결체')
      expect(prompt).toContain('"합니다/해요" 금지')
    })

    test('괄호 풀이 지시', () => {
      const prompt = buildSystemPrompt('moderate', 'definition')
      expect(prompt).toContain('괄호 풀이')
    })

    test('도구 사용 가이드 포함', () => {
      const prompt = buildSystemPrompt('moderate', 'procedure')
      expect(prompt).toContain('search_ordinance')
      // "지역명 필수" 문구로 프롬프트에 포함됨 — 접미어 변형 허용
      expect(prompt).toMatch(/지역명\s*(필수|포함)/)
    })

    test('"위반 시 답변 무효" 강압적 표현 없음', () => {
      const prompt = buildSystemPrompt('complex', 'comparison')
      expect(prompt).not.toContain('무효')
      expect(prompt).not.toContain('절대 필수')
    })
  })

  describe('PromptBuildOptions — 웹 방식 재설계 (relay 경로 전용)', () => {
    test('universalFormat: SPECIALIST 구조 대신 범용 구조 + 파서 하드 제약(근거 법령) 유지', () => {
      const prompt = buildSystemPrompt('moderate', 'scope', '여권 발급 수수료 얼마야?', undefined, { universalFormat: true })
      expect(prompt).toContain('## 결론')
      expect(prompt).toContain('## 근거 법령')
      expect(prompt).not.toContain('## 시뮬레이션') // scope SPECIALIST 구조 미포함
    })

    test('autonomousTools: 조회 전략 지시 제거, 별표 공용원칙만 유지', () => {
      const prompt = buildSystemPrompt('moderate', 'scope', '여권 발급 수수료 얼마야?', undefined, { universalFormat: true, autonomousTools: true })
      expect(prompt).not.toContain('chain_full_research')
      expect(prompt).not.toContain('도구 예산')
      expect(prompt).not.toContain('질의 도메인 힌트')
      expect(prompt).toContain('별표 목록을 먼저')
      expect(prompt).toContain('도구를 최소 1회 이상 호출')
    })

    test('autonomousTools: 결정문 도메인 강제 지시 제거 (기본 모드엔 존재)', () => {
      const q = '개인정보보호위원회 과징금 처분 사례가 궁금해'
      expect(buildSystemPrompt('moderate', 'definition', q, undefined, { autonomousTools: true }))
        .not.toContain('결정문 도메인 강제 지시')
      expect(buildSystemPrompt('moderate', 'definition', q)).toContain('결정문 도메인 강제 지시')
    })

    // 약칭 해석 힌트(aliasBlock)는 자율 모드에서도 유지되나, vitest.setup.ts가
    // search-normalizer를 전역 mock(detectAliasesInQuery→[])하므로 여기선 검증 불가.

    test('opts 미지정 시 기존 동작 완전 불변 (Gemini/Hermes 경로 보호)', () => {
      const prompt = buildSystemPrompt('moderate', 'scope', '여권 발급 수수료 얼마야?')
      expect(prompt).toContain('## 시뮬레이션')
      expect(prompt).toContain('chain_full_research')
      expect(prompt).toContain('도구 예산')
    })
  })
})
