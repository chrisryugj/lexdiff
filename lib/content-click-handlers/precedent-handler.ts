/**
 * Precedent Reference Handler
 * 판례 링크 클릭 처리 (모달로 판례 상세 표시)
 * data-ref="precedent" 타입
 */

import { debugLogger } from '@/lib/debug-logger'
import type { ContentClickContext, ContentClickActions } from './types'

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
    })

    // 히스토리에 추가
    actions.setRefModalHistory((prev) => [
      ...prev,
      {
        title: precedent.name || caseNumber,
        html,
      },
    ])

    debugLogger.success('[precedent-handler] 판례 표시 완료', { caseNumber, name: precedent.name })
  } catch (error) {
    debugLogger.error('[precedent-handler] 판례 조회 실패', error)

    actions.setRefModal({
      open: true,
      title: '판례 조회 실패',
      html: `<div class="text-destructive p-4">
        <p class="font-semibold mb-2">판례를 조회할 수 없습니다</p>
        <p class="text-sm text-muted-foreground">사건번호: ${caseNumber}</p>
        <p class="text-sm text-muted-foreground mt-1">${error instanceof Error ? error.message : '알 수 없는 오류'}</p>
      </div>`,
    })
  }
}

/**
 * 판례 상세 HTML 생성
 */
function buildPrecedentHtml(precedent: any): string {
  const { formatPrecedentDate } = require('@/lib/precedent-parser')
  const { generateLinks } = require('@/lib/unified-link-generator')

  const cleanHtml = (text: string, enableLinks: boolean = false) => {
    if (!text) return ''
    let result = text
      .replace(/<br\\>/g, '<br>')
      .replace(/<br\s*\/?>/gi, '<br>')
      .replace(/&nbsp;/g, ' ')
      // 【】 뒤의 연속 공백/탭 제거 (【원고, 상고인】    텍스트 → 【원고, 상고인】 텍스트)
      .replace(/【([^】]*)】[\s\t]+/g, '【$1】 ')
      // 연속된 br 태그 제거 (빈 줄 정리, 3개 이상 → 2개로)
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
      // 시작/끝 br 태그 제거
      .replace(/^(\s*<br\s*\/?>\s*)+/gi, '')
      .replace(/(\s*<br\s*\/?>\s*)+$/gi, '')
      // 연속된 일반 공백/줄바꿈도 정리 (3개 이상 → 2개로)
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{3,}/g, '  ')
      .trim()

    // 링크 적용 (참조조문, 참조판례용)
    if (enableLinks) {
      result = generateLinks(result, {
        mode: 'aggressive',
        enablePrecedents: true,
      })
    }
    return result
  }

  let html = '<div class="space-y-3 text-sm">'

  // 헤더 정보
  html += `
    <div class="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
      ${precedent.court ? `<span class="px-2 py-1 bg-muted rounded">${precedent.court}</span>` : ''}
      ${precedent.caseNumber ? `<span class="px-2 py-1 bg-muted rounded">${precedent.caseNumber}</span>` : ''}
      ${precedent.date ? `<span class="px-2 py-1 bg-muted rounded">${formatPrecedentDate(precedent.date)}</span>` : ''}
      ${precedent.judgmentType ? `<span class="px-2 py-1 bg-muted rounded">${precedent.judgmentType}</span>` : ''}
    </div>
  `

  // 판시사항
  if (precedent.holdings) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>판시사항
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanHtml(precedent.holdings, true)}</div>
      </div>
    `
  }

  // 판결요지
  if (precedent.summary) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>판결요지
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanHtml(precedent.summary, true)}</div>
      </div>
    `
  }

  // 참조조문
  if (precedent.refStatutes) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>참조조문
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanHtml(precedent.refStatutes, true)}</div>
      </div>
    `
  }

  // 참조판례
  if (precedent.refPrecedents) {
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>참조판례
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg">${cleanHtml(precedent.refPrecedents, true)}</div>
      </div>
    `
  }

  // 전문 (전체 표시)
  if (precedent.fullText) {
    const fullText = cleanHtml(precedent.fullText, true)
    html += `
      <div>
        <h4 class="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
          <span class="w-1.5 h-1.5 rounded-full bg-foreground"></span>판결 전문
        </h4>
        <div class="leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg max-h-[300px] overflow-y-auto whitespace-pre-wrap">${fullText}</div>
      </div>
    `
  }

  html += '</div>'
  return html
}
