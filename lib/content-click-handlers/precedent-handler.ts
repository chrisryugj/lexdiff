/**
 * Precedent Reference Handler
 * 판례 링크 클릭 처리 (모달로 판례 상세 표시)
 * data-ref="precedent" 타입
 */

import { debugLogger } from '@/lib/debug-logger'
import { formatPrecedentDate } from '@/lib/precedent-parser'
import { generateLinks } from '@/lib/unified-link-generator'
import type { ContentClickContext, ContentClickActions } from './types'

/**
 * HTML 텍스트 정리 (모듈 레벨에서 한 번만 정의)
 */
function cleanPrecedentHtml(text: string, enableLinks: boolean = false): string {
  if (!text) return ''
  let result = text
    .replace(/<br\\>/g, '<br>')
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/&nbsp;/g, ' ')
    .replace(/【([^】]*)】[\s\t]+/g, '【$1】 ')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/^(\s*<br\s*\/?>\s*)+/gi, '')
    .replace(/(\s*<br\s*\/?>\s*)+$/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{3,}/g, '  ')
    .trim()

  if (enableLinks) {
    result = generateLinks(result, {
      mode: 'aggressive',
      enablePrecedents: true,
    })
  }
  return result
}

export async function handlePrecedentRef(
  target: HTMLElement,
  context: ContentClickContext,
  actions: ContentClickActions
): Promise<void> {
  const caseNumber = target.getAttribute('data-case-number') || ''
  const court = target.getAttribute('data-court') || ''
  const date = target.getAttribute('data-date') || ''

  if (!caseNumber) {
    debugLogger.warning('[precedent-handler] 사건번호 없음')
    actions.toast({
      title: '판례 정보 부족',
      description: '사건번호 정보가 없어 판례를 조회할 수 없습니다.',
      variant: 'destructive',
    })
    return
  }

  debugLogger.info('[precedent-handler] 판례 클릭', { caseNumber, court, date })

  try {
    // 로딩 표시
    actions.setRefModal({
      open: true,
      title: `판례 조회 중...`,
      html: '<div class="flex items-center justify-center py-8"><div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div></div>',
    })

    // 판례 검색 API 호출 (사건번호로 검색)
    const searchResponse = await fetch(`/api/precedent-search?query=${encodeURIComponent(caseNumber)}&page=1`)

    if (!searchResponse.ok) {
      throw new Error(`검색 실패: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()

    if (!searchData.precedents || searchData.precedents.length === 0) {
      throw new Error('판례를 찾을 수 없습니다')
    }

    // 첫 번째 결과의 ID로 상세 조회
    const precedentId = searchData.precedents[0].id

    const detailResponse = await fetch(`/api/precedent-detail?id=${precedentId}`)

    if (!detailResponse.ok) {
      throw new Error(`상세 조회 실패: ${detailResponse.status}`)
    }

    const precedent = await detailResponse.json()

    if (!precedent || precedent.error) {
      throw new Error(precedent?.error || '판례 상세 정보를 가져올 수 없습니다')
    }

    // HTML 생성
    const html = buildPrecedentHtml(precedent)

    // 모달 업데이트
    actions.setRefModal({
      open: true,
      title: precedent.name || caseNumber,
      html,
      precedentMeta: {
        court: precedent.court,
        caseNumber: precedent.caseNumber,
        date: formatPrecedentDate(precedent.date),
        judgmentType: precedent.judgmentType,
      },
    })

    // 히스토리 관리: 모달이 이미 열려있으면 스택에 추가, 새로 여는 거면 초기화
    actions.setRefModalHistory((prev) => {
      // 이전 히스토리가 없으면 (새로 여는 모달) → 초기화
      // 이전 히스토리가 있으면 (모달 내에서 다른 판례 클릭) → 스택에 추가
      if (prev.length === 0) {
        return [] // 처음 열 때는 빈 히스토리 유지
      }
      return [
        ...prev,
        {
          title: precedent.name || caseNumber,
          html,
        },
      ]
    })

    debugLogger.success('[precedent-handler] 판례 표시 완료', { caseNumber, name: precedent.name })
  } catch (error) {
    debugLogger.error('[precedent-handler] 판례 조회 실패', error)

    // XSS 방지: 에러 메시지 이스케이프
    const escapeHtml = (s: string) => s.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#039;'}[c] || c))
    const safeMessage = error instanceof Error ? escapeHtml(error.message) : '알 수 없는 오류'
    const safeCaseNumber = escapeHtml(caseNumber)

    actions.setRefModal({
      open: true,
      title: '판례 조회 실패',
      html: `<div class="text-destructive p-4">
        <p class="font-semibold mb-2">판례를 조회할 수 없습니다</p>
        <p class="text-sm text-muted-foreground">사건번호: ${safeCaseNumber}</p>
        <p class="text-sm text-muted-foreground mt-1">${safeMessage}</p>
      </div>`,
    })
  }
}

/**
 * 판례 상세 HTML 생성
 * @public - law-viewer에서도 사용
 */
export function buildPrecedentHtml(precedent: any): string {
  let html = '<div class="space-y-3" style="overflow-wrap: anywhere; word-break: break-word; font-size: inherit;">'

  // 판시사항
  if (precedent.holdings) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground mb-1" style="font-size: 1.05em;">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>판시사항
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanPrecedentHtml(precedent.holdings, true)}</div>
      </div>
    `
  }

  // 판결요지
  if (precedent.summary) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground mb-1" style="font-size: 1.05em;">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>판결요지
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanPrecedentHtml(precedent.summary, true)}</div>
      </div>
    `
  }

  // 참조조문
  if (precedent.refStatutes) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground mb-1" style="font-size: 1.05em;">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>참조조문
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanPrecedentHtml(precedent.refStatutes, true)}</div>
      </div>
    `
  }

  // 참조판례
  if (precedent.refPrecedents) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground mb-1" style="font-size: 1.05em;">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>참조판례
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanPrecedentHtml(precedent.refPrecedents, true)}</div>
      </div>
    `
  }

  // 전문 (전체 표시)
  if (precedent.fullText) {
    // 전문만 있는 경우 (판시사항/판결요지 없음) 높이 2배
    const hasOtherContent = precedent.holdings || precedent.summary || precedent.refStatutes || precedent.refPrecedents
    const maxHeight = hasOtherContent ? 'max-h-[300px]' : 'max-h-[600px]'

    // 전문에도 링크 생성 적용
    let fullText = cleanPrecedentHtml(precedent.fullText, true)
      // br 태그를 줄바꿈으로 통일
      .replace(/<br\s*\/?>/gi, '\n')
      // 모든 연속 줄바꿈/공백 → 단일 줄바꿈
      .replace(/\n\s*\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      // 【】 앞에 빈줄 추가
      .replace(/([^\n])\n?【/g, '$1\n\n【')
      // 【】 뒤 내용은 바로 붙임
      .replace(/】\s+/g, '】\n')
      // 시작 빈줄 제거
      .replace(/^\s*\n+/, '')
      .trim()

    // 【이유】 섹션 내에서만 2. 3. 등 앞에 빈줄 추가
    fullText = fullText.replace(/(【이유】[\s\S]*?)$/g, (reasonSection) => {
      return reasonSection
        .replace(/\n([2-9]\.\s)/g, '\n\n$1')
        .replace(/\n([나다라마바사]\.\s)/g, '\n\n$1')
    })

    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground mb-1" style="font-size: 1.05em;">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>판결 전문
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg ${maxHeight} overflow-y-auto whitespace-pre-wrap">${fullText}</div>
      </div>
    `
  }

  html += '</div>'
  return html
}
