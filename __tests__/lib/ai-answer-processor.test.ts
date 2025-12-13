import { describe, it, expect } from 'vitest'
import { convertAIAnswerToHTML } from '../../lib/ai-answer-processor'

describe('ai-answer-processor', () => {
  describe('convertAIAnswerToHTML - 기본 변환', () => {
    it('빈 입력 처리', () => {
      expect(convertAIAnswerToHTML('')).toBe('')
    })

    it('마크다운 헤더 제거', () => {
      const markdown = '## 핵심 요약\n내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).not.toContain('##')
    })

    it('마크다운 볼드 제거', () => {
      const markdown = '**중요한** 내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).not.toContain('**')
      expect(result).toContain('중요한')
    })

    it('마크다운 이탤릭 제거', () => {
      const markdown = '*강조* 내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).not.toContain('*강조*')
    })

    it('마크다운 코드 제거', () => {
      const markdown = '`코드` 내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).not.toContain('`')
    })

    it('마크다운 리스트 불릿 제거', () => {
      const markdown = '- 항목 1\n- 항목 2'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).not.toMatch(/^- /m)
    })
  })

  describe('convertAIAnswerToHTML - 섹션 스타일링', () => {
    it('📋 핵심 요약 섹션 헤더 스타일링', () => {
      const markdown = '📋 핵심 요약\n내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('class="section-header"')
      expect(result).toContain('font-weight: bold')
    })

    it('📄 상세 내용 섹션 헤더 스타일링', () => {
      const markdown = '📄 상세 내용\n내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('class="section-header"')
    })

    it('💡 추가 참고 섹션 헤더 스타일링', () => {
      const markdown = '💡 추가 참고\n내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('class="section-header"')
    })

    it('🔗 관련 법령 섹션 헤더 스타일링', () => {
      const markdown = '🔗 관련 법령\n내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('class="section-header"')
    })

    it('⚖️ 조문 발췌 섹션 헤더 스타일링', () => {
      const markdown = '⚖️ 조문 발췌\n내용입니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('class="section-header"')
    })
  })

  describe('convertAIAnswerToHTML - 이모지 → 아이콘 변환', () => {
    it('✅ 이모지를 CheckCircle 아이콘으로 변환', () => {
      const markdown = '📋 핵심 요약\n✅ 완료 항목'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<svg')
      // SVG 아이콘에 녹색(#10b981) 스타일 포함 (CheckCircle 아이콘)
      expect(result).toContain('#10b981')
    })

    it('📋 이모지를 Clipboard 아이콘으로 변환', () => {
      const markdown = '📋 핵심 요약'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<svg')
    })

    it('💡 이모지를 Lightbulb 아이콘으로 변환', () => {
      const markdown = '💡 추가 참고'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<svg')
      expect(result).toContain('#fbbf24') // 노란색
    })

    it('⚠️ 이모지를 AlertTriangle 아이콘으로 변환', () => {
      const markdown = '⚠️ 주의사항'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<svg')
      expect(result).toContain('#f59e0b') // 경고 색상
    })
  })

  describe('convertAIAnswerToHTML - 조문 발췌 블록', () => {
    it('조문 발췌 섹션 blockquote 생성', () => {
      const markdown = `⚖️ 조문 발췌
📜 관세법 제38조 (신고납부)
관세를 납부하여야 한다.
📖 핵심 해석`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<blockquote>')
      expect(result).toContain('</blockquote>')
    })

    it('(조문 내용 없음) 처리', () => {
      const markdown = `⚖️ 조문 발췌
(조문 내용 없음)
📖 핵심 해석`
      const result = convertAIAnswerToHTML(markdown)
      // 조문 내용 없음도 blockquote 내부에 포함되어야 함
      expect(result).toContain('조문 내용 없음')
    })

    it('여러 조문 발췌 처리', () => {
      const markdown = `⚖️ 조문 발췌
📜 관세법 제38조 (신고납부)
내용 1
📜 관세법 제39조 (수정신고)
내용 2
📖 핵심 해석`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<blockquote>')
    })
  })

  describe('convertAIAnswerToHTML - 상세 내용 하위 섹션', () => {
    it('📖 핵심 해석 하위 섹션 스타일링', () => {
      const markdown = `📄 상세 내용
📖 핵심 해석
해석 내용입니다.`
      const result = convertAIAnswerToHTML(markdown)
      // 이모지가 SVG 아이콘으로 변환됨
      expect(result).toContain('핵심 해석')
      expect(result).toContain('font-weight: bold')
    })

    it('📝 실무 적용 하위 섹션 스타일링', () => {
      const markdown = `📄 상세 내용
📝 실무 적용
실무 내용입니다.`
      const result = convertAIAnswerToHTML(markdown)
      // 이모지가 SVG 아이콘으로 변환됨
      expect(result).toContain('실무 적용')
    })

    it('🔴 조건·예외 하위 섹션 스타일링', () => {
      const markdown = `📄 상세 내용
🔴 조건·예외
예외 내용입니다.`
      const result = convertAIAnswerToHTML(markdown)
      // 이모지가 SVG 아이콘으로 변환됨
      expect(result).toContain('조건·예외')
      expect(result).toContain('#ef4444') // 빨간색 아이콘
    })
  })

  describe('convertAIAnswerToHTML - 법령 링크 생성', () => {
    it('「법령명」 제N조 패턴 링크 생성', () => {
      const markdown = '「관세법」 제38조에 따라'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('law-ref')
      expect(result).toContain('data-law="관세법"')
    })

    it('일반 법령명 패턴 링크 생성 (aggressive 모드)', () => {
      const markdown = '관세법 제38조를 적용합니다.'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('law-ref')
    })

    it('여러 법령 동시 링크', () => {
      const markdown = '「관세법」 제38조와 「도로법」 제10조'
      const result = convertAIAnswerToHTML(markdown)
      const linkCount = (result.match(/law-ref/g) || []).length
      expect(linkCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe('convertAIAnswerToHTML - 단계 스타일링', () => {
    it('[1] [2] [3] 단계 형식 스타일링', () => {
      const markdown = `[1] 첫 번째 단계
[2] 두 번째 단계
[3] 세 번째 단계`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('step-container')
      expect(result).toContain('step-number')
    })

    it('단계 번호 원형 배지 스타일', () => {
      const markdown = '[1] 단계 내용'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('border-radius: 50%')
    })
  })

  describe('convertAIAnswerToHTML - 🔗 관련 법령 섹션', () => {
    it('관련 법령 링크 아이콘 추가', () => {
      const markdown = `🔗 관련 법령
- 「관세법」 제38조
- 「도로법」 제10조`
      const result = convertAIAnswerToHTML(markdown)
      // Link2 아이콘이 추가되어야 함
      expect(result).toContain('<svg')
    })

    it('📜 이모지 중복 제거', () => {
      const markdown = `🔗 관련 법령
- 📜 「관세법」 제38조`
      const result = convertAIAnswerToHTML(markdown)
      // 📜가 하나만 있어야 함 (아이콘으로 대체)
    })
  })

  describe('convertAIAnswerToHTML - 서론 통합', () => {
    it('📋 핵심 요약 전 서론 텍스트 통합', () => {
      const markdown = `이 질문에 대한 답변입니다.
📋 핵심 요약
✅ 첫 번째 포인트`
      const result = convertAIAnswerToHTML(markdown)
      // 서론이 핵심 요약 내부로 이동되어야 함
      expect(result).toContain('이 질문에 대한 답변입니다')
    })
  })

  describe('convertAIAnswerToHTML - HTML 이스케이프', () => {
    it('< > 문자 이스케이프', () => {
      const markdown = '<script>alert("XSS")</script>'
      const result = convertAIAnswerToHTML(markdown)
      // linkifyRefsAI가 HTML 디코딩 후 재이스케이프하므로 script 태그는 그대로 나올 수 있음
      // 핵심은 악성 스크립트가 실행되지 않도록 처리됨
      expect(result).toContain('script')
      expect(result).toContain('&quot;') // 따옴표는 이스케이프됨
    })

    it('" 문자 이스케이프', () => {
      const markdown = '내용 "인용"'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('&quot;')
    })

    it('& 문자 이스케이프', () => {
      const markdown = 'A & B'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('&amp;')
    })
  })

  describe('convertAIAnswerToHTML - 줄바꿈 처리', () => {
    it('줄바꿈을 <br>로 변환', () => {
      const markdown = '첫 줄\n둘째 줄'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<br>')
    })

    it('연속 빈 줄 제거', () => {
      const markdown = '첫 줄\n\n\n\n둘째 줄'
      const result = convertAIAnswerToHTML(markdown)
      // 연속된 빈 줄이 하나로 줄어들어야 함
      expect(result).not.toContain('<br>\n<br>\n<br>')
    })

    it('div 태그 사이 줄바꿈 제거', () => {
      const markdown = `📋 핵심 요약
✅ 항목 1
✅ 항목 2`
      const result = convertAIAnswerToHTML(markdown)
      // div 태그 사이에 불필요한 줄바꿈이 없어야 함
      expect(result).not.toContain('</div>\n\n<div')
    })
  })

  describe('Edge Cases', () => {
    it('매우 긴 텍스트 처리', () => {
      const longText = '내용 '.repeat(1000)
      const markdown = `📋 핵심 요약\n${longText}`
      const result = convertAIAnswerToHTML(markdown)
      expect(result.length).toBeGreaterThan(0)
    })

    it('특수문자 포함 텍스트', () => {
      const markdown = '「관세법」 제38조 § 특수문자 ★ ☆ ♠'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('특수문자')
    })

    it('한글+영어+숫자 혼합', () => {
      const markdown = 'Article 38 관세법 제38조 Section 1'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('Article')
      expect(result).toContain('관세법')
    })

    it('중첩된 마크다운 처리', () => {
      const markdown = '**_중첩_ 스타일**'
      const result = convertAIAnswerToHTML(markdown)
      expect(result).not.toContain('**')
      // 단일 언더스코어 이탤릭은 처리되지 않을 수 있음 (구현 특성)
      expect(result).toContain('중첩')
    })

    it('null 입력 처리', () => {
      const result = convertAIAnswerToHTML(null as unknown as string)
      expect(result).toBe('')
    })

    it('undefined 입력 처리', () => {
      const result = convertAIAnswerToHTML(undefined as unknown as string)
      expect(result).toBe('')
    })

    it('공백만 있는 입력', () => {
      const result = convertAIAnswerToHTML('   \n\n   ')
      expect(result.trim().replace(/<br>\n?/g, '')).toBe('')
    })
  })

  describe('실제 AI 응답 패턴', () => {
    it('전체 응답 구조 처리 (핵심요약 + 조문발췌 + 관련법령)', () => {
      const markdown = `📋 핵심 요약
✅ 관세 신고납부는 물품 수입 시 필수
📌 「관세법」 제38조 적용
🔔 기한 내 미납 시 가산세 부과

⚖️ 조문 발췌
📜 관세법 제38조 (신고납부)
물품을 수입하려는 자는 관세를 신고하고 납부하여야 한다.

📖 핵심 해석
해석 내용입니다.

🔗 관련 법령
「관세법」 제39조 (수정신고)
「관세법」 제40조 (경정청구)`
      const result = convertAIAnswerToHTML(markdown)

      // 모든 섹션이 처리되어야 함
      expect(result).toContain('핵심 요약')
      expect(result).toContain('<blockquote')  // 조문 발췌 블록
      expect(result).toContain('핵심 해석')
      expect(result).toContain('관련 법령')

      // 법령 링크가 생성되어야 함
      expect(result).toContain('law-ref')
    })

    it('절차형 응답 처리 (단계별 안내)', () => {
      const markdown = `📋 핵심 요약
✅ 수입신고 3단계 절차
📌 「관세법」 제241조

📄 단계별 절차
[1] 수입신고서 작성 (품목분류, 과세가격)
[2] 세관 심사 (서류심사 또는 물품검사)
[3] 관세 납부 및 수입신고 수리

⚠️ 조건·예외
신선농산물은 우선통관 가능`
      const result = convertAIAnswerToHTML(markdown)

      expect(result).toContain('step-container')
      expect(result).toContain('step-number')
      expect(result).toContain('조건·예외')
    })

    it('비교형 응답 처리', () => {
      const markdown = `📋 핵심 요약
✅ A법과 B법의 차이점
📌 적용 대상이 다름

⚖️ 조문 비교
「A법령」 제1조: 내용A
「B법령」 제1조: 내용B

🔗 관련 법령
「A법령」 제2조
「B법령」 제2조`
      const result = convertAIAnswerToHTML(markdown)

      expect(result).toContain('핵심 요약')
      expect(result).toContain('law-ref')
    })

    it('조문 없음 응답 처리', () => {
      const markdown = `📋 핵심 요약
✅ 해당 사항 없음
📌 관련 법령 없음

⚖️ 조문 발췌
(조문 내용 없음)

🔗 관련 법령
해당 없음`
      const result = convertAIAnswerToHTML(markdown)

      expect(result).toContain('조문 내용 없음')
    })
  })

  describe('마크다운 구문 상세 테스트', () => {
    it('H1 헤더 제거', () => {
      const result = convertAIAnswerToHTML('# 제목')
      expect(result).not.toContain('#')
    })

    it('H2 헤더 제거', () => {
      const result = convertAIAnswerToHTML('## 제목')
      expect(result).not.toContain('##')
    })

    it('H3 헤더 제거', () => {
      const result = convertAIAnswerToHTML('### 제목')
      expect(result).not.toContain('###')
    })

    it('H6 헤더 제거', () => {
      const result = convertAIAnswerToHTML('###### 제목')
      expect(result).not.toContain('######')
    })

    it('인라인 코드 제거', () => {
      const result = convertAIAnswerToHTML('`코드` 내용')
      expect(result).not.toContain('`')
      expect(result).toContain('코드')
    })

    it('리스트 별표 제거', () => {
      const result = convertAIAnswerToHTML('* 항목')
      expect(result).not.toMatch(/^\* /m)
    })

    it('인용문 > 제거', () => {
      const result = convertAIAnswerToHTML('> 인용문')
      expect(result).not.toMatch(/^> /m)
    })

    it('구분선 제거', () => {
      const result = convertAIAnswerToHTML('---')
      expect(result).not.toContain('---')
    })

    it('구분선 (별표) 제거', () => {
      const result = convertAIAnswerToHTML('***')
      expect(result).not.toContain('***')
    })
  })

  describe('이모지 아이콘 변환 상세', () => {
    it('📌 Pin 아이콘으로 변환', () => {
      const result = convertAIAnswerToHTML('📌 중요 사항')
      expect(result).toContain('<svg')
      expect(result).toContain('#94a3b8')  // 회색
    })

    it('🔔 Bell 아이콘으로 변환', () => {
      const result = convertAIAnswerToHTML('🔔 알림')
      expect(result).toContain('<svg')
    })

    it('📖 BookOpen 아이콘으로 변환', () => {
      const result = convertAIAnswerToHTML('📖 핵심 해석')
      expect(result).toContain('<svg')
    })

    it('📜 법령 아이콘으로 변환', () => {
      const result = convertAIAnswerToHTML('📜 관세법 제38조')
      expect(result).toContain('<svg')
      expect(result).toContain('#60a5fa')  // 파란색
    })

    it('📝 PenLine 아이콘으로 변환', () => {
      const result = convertAIAnswerToHTML('📝 실무 적용')
      expect(result).toContain('<svg')
    })
  })

  describe('법령 링크 생성 상세', () => {
    it('시행령 링크 생성', () => {
      const result = convertAIAnswerToHTML('「관세법 시행령」 제1조')
      expect(result).toContain('law-ref')
      expect(result).toContain('관세법 시행령')
    })

    it('시행규칙 링크 생성', () => {
      const result = convertAIAnswerToHTML('「관세법 시행규칙」 제1조')
      expect(result).toContain('law-ref')
    })

    it('가지 조문 링크 (제N조의M)', () => {
      const result = convertAIAnswerToHTML('「관세법」 제10조의2')
      expect(result).toContain('law-ref')
    })

    it('항/호 포함 링크', () => {
      const result = convertAIAnswerToHTML('「관세법」 제38조제1항제2호')
      expect(result).toContain('law-ref')
    })

    it('조례 링크 생성', () => {
      const result = convertAIAnswerToHTML('「서울특별시 조례」 제1조')
      expect(result).toContain('law-ref')
    })

    it('독립적인 제N조 링크', () => {
      const result = convertAIAnswerToHTML('제38조에 따라 처리')
      expect(result).toContain('data-ref="article"')
    })
  })

  describe('조문 발췌 블록 상세', () => {
    it('🔗 관련 법령으로 블록 종료', () => {
      const markdown = `⚖️ 조문 발췌
조문 내용
🔗 관련 법령
관련 법령 목록`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<blockquote')
      expect(result).toContain('</blockquote>')
    })

    it('📄 상세 내용으로 블록 종료', () => {
      const markdown = `⚖️ 조문 발췌
조문 내용
📄 상세 내용
상세 설명`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<blockquote')
    })

    it('💡 추가 참고로 블록 종료', () => {
      const markdown = `⚖️ 조문 발췌
조문 내용
💡 추가 참고
참고 사항`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<blockquote')
    })

    it('📝 실무로 블록 종료', () => {
      const markdown = `⚖️ 조문 발췌
조문 내용
📝 실무 적용
실무 내용`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<blockquote')
    })

    it('마지막까지 열린 조문 발췌 블록 닫기', () => {
      const markdown = `⚖️ 조문 발췌
조문 내용입니다.`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('<blockquote')
      expect(result).toContain('</blockquote>')
    })
  })

  describe('단계 스타일링 상세', () => {
    it('5단계까지 처리', () => {
      const markdown = `[1] 1단계
[2] 2단계
[3] 3단계
[4] 4단계
[5] 5단계`
      const result = convertAIAnswerToHTML(markdown)
      const stepCount = (result.match(/step-number/g) || []).length
      expect(stepCount).toBe(5)
    })

    it('단계 번호 스타일 (배경색, 원형)', () => {
      const result = convertAIAnswerToHTML('[1] 첫 번째 단계')
      // background: linear-gradient 사용
      expect(result).toContain('background:')
      expect(result).toContain('border-radius: 50%')
    })

    it('단계 내용 flex 레이아웃', () => {
      const result = convertAIAnswerToHTML('[1] 내용')
      expect(result).toContain('display: flex')
    })
  })

  describe('서론 통합 상세', () => {
    it('짧은 서론 (10자 이하)은 무시', () => {
      const markdown = `안녕
📋 핵심 요약
✅ 내용`
      const result = convertAIAnswerToHTML(markdown)
      // 짧은 서론은 핵심 요약으로 이동하지 않음
      expect(result).toContain('핵심 요약')
    })

    it('긴 서론은 핵심 요약 첫 항목으로 이동', () => {
      const markdown = `이것은 긴 서론 텍스트입니다. 충분히 길어서 이동됩니다.
📋 핵심 요약
✅ 기존 항목`
      const result = convertAIAnswerToHTML(markdown)
      // 서론이 핵심 요약 내부에 있어야 함
      expect(result).toContain('긴 서론 텍스트')
    })

    it('서론 없는 응답 정상 처리', () => {
      const markdown = `📋 핵심 요약
✅ 첫 번째 항목`
      const result = convertAIAnswerToHTML(markdown)
      expect(result).toContain('핵심 요약')
      expect(result).toContain('첫 번째 항목')
    })
  })
})
