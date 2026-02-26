import type { IconName } from '@/components/ui/icon'

// 단색으로 통일 - 다크/라이트 테마 모두 대응
export const SECTION_ICON_COLOR = 'text-foreground/70'

export const SECTION_ICON_MAP: Array<{ pattern: RegExp; icon: IconName }> = [
  // 공통 섹션
  { pattern: /^(정의|쉬운\s*3줄\s*요약)/, icon: 'book-open' },
  { pattern: /^(법적\s*성질|상세\s*해설)/, icon: 'scale' },
  { pattern: /^조문\s*원문/, icon: 'file-text' },
  { pattern: /^조문\s*인용\s*원칙/, icon: 'book-open' },
  { pattern: /^핵심\s*해석/, icon: 'lightbulb' },
  { pattern: /^구성\s*요건/, icon: 'list-checks' },
  { pattern: /^(유사\s*개념|헷갈리는\s*개념)/, icon: 'git-compare' },
  { pattern: /^(예시|이해를\s*돕는\s*예시)/, icon: 'lightbulb' },
  { pattern: /^(관계\s*법령|근거\s*법령)/, icon: 'book-open' },
  { pattern: /^주요\s*내용/, icon: 'file-text' },
  { pattern: /^(비교표|상세\s*비교표)/, icon: 'git-compare' },
  { pattern: /^(보완\s*방법|보완책)/, icon: 'lightbulb' },
  { pattern: /^(필수\s*요건|가산\s*요건)/, icon: 'list-checks' },
  { pattern: /^(신청\s*방법|혜택\s*받는\s*방법)/, icon: 'file-text' },
  { pattern: /^상황별\s*추천/, icon: 'help-circle' },
  { pattern: /^요건\s*체크/, icon: 'list-checks' },

  // requirement (요건) 섹션
  { pattern: /^(결론|핵심\s*결론)/, icon: 'check-circle-2' },
  { pattern: /^요건\s*체크\s*순서/, icon: 'list-ordered' },
  { pattern: /^0단계|결격사유\s*먼저/, icon: 'x-circle' },
  { pattern: /^1단계|절대적\s*요건/, icon: 'check-circle' },
  { pattern: /^2단계|상대적\s*요건/, icon: 'star' },
  { pattern: /^[3-9]단계|\d{2,}단계/, icon: 'chevron-right' }, // 3단계 이상 범용 아이콘
  { pattern: /^적극적\s*요건/, icon: 'check-circle' },
  { pattern: /^소극적\s*요건/, icon: 'x-circle' },
  { pattern: /^(서류|필수\s*요건\s*체크리스트)/, icon: 'list-checks' },
  { pattern: /^(예외|특례|혹시\s*여기에\s*해당)/, icon: 'alert-triangle' },
  { pattern: /^(주의사항|코디네이터의\s*팁)/, icon: 'alert-circle' },

  // procedure (절차) 섹션
  { pattern: /^(전체\s*흐름|전체\s*로드맵)/, icon: 'list-ordered' },
  { pattern: /^(단계별\s*안내|단계별\s*상세\s*가이드)/, icon: 'list-ordered' },
  { pattern: /^기한\s*요약표?/, icon: 'clock' },
  { pattern: /^기한\s*계산\s*\(.*?\)/, icon: 'calendar' },
  { pattern: /^기한\s*계산\s*체크리스트/, icon: 'list-checks' },
  { pattern: /^(불복|구제|반려\s*주의사항)/, icon: 'shield-check' },

  // comparison (비교) 섹션
  { pattern: /^(핵심\s*차이|3줄\s*비교\s*요약)/, icon: 'git-compare' },
  { pattern: /^(상세\s*비교|어떤\s*걸\s*선택)/, icon: 'help-circle' },
  { pattern: /^(A의\s*특징|B의\s*특징|컨설턴트의\s*조언)/, icon: 'lightbulb' },
  { pattern: /^선택\s*가이드/, icon: 'check-circle-2' },
  { pattern: /^실무\s*팁/, icon: 'lightbulb' },

  // application (적용) 섹션
  { pattern: /^(요건별\s*검토|요건\s*정밀\s*검토)/, icon: 'clipboard-check' },
  { pattern: /^요건\s*충족\s*요약/, icon: 'clipboard-check' },
  { pattern: /^확신도\s*판단\s*기준표/, icon: 'list-checks' },
  { pattern: /^(추가\s*확인|만약\s*세모)/, icon: 'help-circle' },
  { pattern: /^(다음\s*행동|유사\s*판례)/, icon: 'gavel' },
  { pattern: /^판정\s*결과/, icon: 'gavel' },

  // consequence (효과) 섹션
  { pattern: /^(행정적|핵심\s*결과|예상되는\s*조치)/, icon: 'alert-triangle' },
  { pattern: /^민사적\s*효과/, icon: 'scale' },
  { pattern: /^형사적\s*효과/, icon: 'gavel' },
  { pattern: /^(효과\s*요약|상세\s*불이익)/, icon: 'alert-triangle' },
  { pattern: /^(구제|치유)/, icon: 'shield-check' },

  // scope (범위/금액) 섹션
  { pattern: /^(법정\s*기준|계산\s*결과)/, icon: 'calculator' },
  { pattern: /^(산정\s*방법|시뮬레이션)/, icon: 'chart-line' },
  { pattern: /^(가산|감경)/, icon: 'trending-up' },
  { pattern: /^계산\s*예시/, icon: 'list-ordered' },
  { pattern: /^기한\s*계산/, icon: 'calendar' },
  { pattern: /^실무\s*참고/, icon: 'bookmark' },

  // exemption (면제) 섹션
  { pattern: /^(원칙|혜택\s*적용\s*가능성)/, icon: 'award' },
  { pattern: /^(면제|감면\s*요건\s*체크)/, icon: 'list-checks' },
  { pattern: /^면제\s*\/\s*감면\s*범위/, icon: 'coins' },
  { pattern: /^(신청\s*절차|혜택\s*받는\s*방법)/, icon: 'file-text' },
  { pattern: /^(사후관리|보호관의\s*조언)/, icon: 'shield-check' },
  { pattern: /^유사\s*면제제도/, icon: 'git-compare' },
]

export function getSectionIcon(text: string): { iconName: IconName; color: string } | null {
  const trimmed = text.trim()
  for (const { pattern, icon } of SECTION_ICON_MAP) {
    if (pattern.test(trimmed)) {
      return { iconName: icon, color: SECTION_ICON_COLOR }
    }
  }
  return null
}
