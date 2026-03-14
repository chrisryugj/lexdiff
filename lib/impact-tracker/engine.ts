/**
 * 법령 영향 추적기 엔진 - AsyncGenerator + SSE 패턴
 *
 * 6단계 파이프라인:
 * 1. resolving  — search_law (+ search_ordinance 폴백) 으로 MST 확보
 * 2. comparing  — compare_old_new로 변경 조문 + 신구문 텍스트
 * 3. tracing    — get_three_tier로 하위법령 의존성
 * 4. classifying — AI 영향도 분류 (OpenClaw → Gemini)
 * 5. summarizing — AI 종합 요약 (OpenClaw → Gemini)
 * 6. complete   — 최종 결과 조립
 */

import { executeTool } from '@/lib/fc-rag/tool-adapter'
import { classifyImpact, generateImpactSummary, getAISource } from './classifier'
import {
  parseSearchResult,
  parseOrdinanceSearchResult,
  parseCompareOldNew,
  buildChangesFromOldNew,
  parseThreeTierResult,
  type ResolvedLaw,
} from './result-parser'
import type {
  ImpactTrackerRequest,
  ImpactSSEEvent,
  ImpactItem,
  ImpactSummary,
  ImpactSeverity,
  ArticleChange,
  DownstreamImpact,
  ClassificationInput,
} from './types'

export async function* executeImpactAnalysis(
  request: ImpactTrackerRequest,
  options?: { signal?: AbortSignal; apiKey?: string },
): AsyncGenerator<ImpactSSEEvent> {
  const { lawNames, dateFrom, dateTo } = request
  const allChanges: ArticleChange[] = []
  const allOldNewMap = new Map<string, { oldText: string; newText: string }>()
  const allDownstreamMap = new Map<string, DownstreamImpact[]>()
  const resolvedLaws: ResolvedLaw[] = []

  try {
    // ── Step 1: 법령 검색 (resolving) ──
    yield { type: 'status', message: '법령 검색 중...', progress: 2, step: 'resolving' }

    for (const lawName of lawNames) {
      if (options?.signal?.aborted) throw new Error('cancelled')

      // 1차: search_law (국가법령)
      const lawResult = await executeTool('search_law', { query: lawName })
      let parsed: ResolvedLaw[] = []

      if (!lawResult.isError) {
        parsed = parseSearchResult(lawResult.result)
      }

      // 2차: search_ordinance 폴백 (자치법규)
      if (parsed.length === 0) {
        const ordinResult = await executeTool('search_ordinance', { query: lawName })
        if (!ordinResult.isError) {
          parsed = parseOrdinanceSearchResult(ordinResult.result)
        }
      }

      if (parsed.length === 0) {
        yield {
          type: 'error',
          message: `"${lawName}" 검색 결과가 없습니다.`,
          recoverable: true,
        }
        continue
      }

      const law = parsed[0]
      resolvedLaws.push(law)
      yield {
        type: 'law_resolved',
        lawName: law.lawName,
        lawId: law.lawId,
        mst: law.mst,
      }
    }

    if (resolvedLaws.length === 0) {
      yield { type: 'error', message: '검색된 법령이 없습니다.', recoverable: false }
      return
    }

    const progress1 = 10

    // ── Step 2: 신구법 비교 (comparing) ──
    yield { type: 'status', message: '신구법 비교 조회 중...', progress: progress1, step: 'comparing' }

    for (let i = 0; i < resolvedLaws.length; i++) {
      if (options?.signal?.aborted) throw new Error('cancelled')

      const law = resolvedLaws[i]
      const progressPer = progress1 + ((i + 1) / resolvedLaws.length) * 30

      yield {
        type: 'status',
        message: `${law.lawName} 신구법 비교 중...`,
        progress: Math.round(progressPer),
        step: 'comparing',
      }

      const compareResult = await executeTool('compare_old_new', {
        lawId: law.lawId,
        mst: law.mst,
      })

      if (compareResult.isError) {
        yield {
          type: 'error',
          message: `${law.lawName} 신구법 비교 실패: ${compareResult.result.slice(0, 100)}`,
          recoverable: true,
        }
        continue
      }

      // 조례 등 신구법 대조 데이터 없는 경우
      if (compareResult.result.includes('개정 이력이 없거나') || compareResult.result.includes('데이터가 없습니다')) {
        yield {
          type: 'error',
          message: `${law.lawName}: 신구법 대조 데이터가 없습니다. (${law.kind === '조례' ? '자치법규는 신구법비교를 지원하지 않을 수 있습니다' : '해당 기간 개정 이력 없음'})`,
          recoverable: true,
        }
        continue
      }

      const parsed = parseCompareOldNew(compareResult.result)
      const revisionDate = extractDateFromCompare(compareResult.result)
      const changes = buildChangesFromOldNew(parsed, law.lawId, law.mst, revisionDate)

      allChanges.push(...changes)

      for (const pair of parsed.pairs) {
        const key = `${law.lawId}:${pair.joDisplay}`
        allOldNewMap.set(key, { oldText: pair.oldText, newText: pair.newText })
      }

      yield { type: 'changes_found', lawName: law.lawName, changes }
    }

    if (allChanges.length === 0) {
      yield {
        type: 'status',
        message: '조회 기간 내 변경사항이 없습니다.',
        progress: 100,
        step: 'complete',
      }
      yield {
        type: 'complete',
        result: {
          items: [],
          summary: buildEmptySummary(dateFrom, dateTo),
          analyzedAt: new Date().toISOString(),
        },
      }
      return
    }

    // ── Step 3: 하위법령 추적 (tracing) ──
    yield { type: 'status', message: '하위법령 영향 추적 중...', progress: 45, step: 'tracing' }

    for (let i = 0; i < resolvedLaws.length; i++) {
      if (options?.signal?.aborted) throw new Error('cancelled')

      const law = resolvedLaws[i]

      // 조례는 three_tier 지원 안 함 — 스킵
      if (law.kind === '조례') continue

      const progressPer = 45 + ((i + 1) / resolvedLaws.length) * 15

      yield {
        type: 'status',
        message: `${law.lawName} 위임법령 조회 중...`,
        progress: Math.round(progressPer),
        step: 'tracing',
      }

      const threeTierResult = await executeTool('get_three_tier', {
        lawId: law.lawId,
        mst: law.mst,
      })

      if (!threeTierResult.isError) {
        const downstream = parseThreeTierResult(threeTierResult.result)
        for (const [joDisplay, impacts] of downstream) {
          const key = `${law.lawId}:${joDisplay}`
          allDownstreamMap.set(key, impacts)
        }
      }
    }

    // ── Step 4: AI 영향도 분류 (classifying) ──
    yield { type: 'status', message: 'AI 영향도 분류 중...', progress: 65, step: 'classifying' }

    const aiSource = await getAISource()
    yield { type: 'ai_source', source: aiSource }

    const classificationInputs: ClassificationInput[] = allChanges.map(change => {
      const key = `${change.lawId}:${change.joDisplay}`
      const oldNew = allOldNewMap.get(key)
      const downstream = allDownstreamMap.get(key) || []
      return {
        lawName: change.lawName,
        jo: change.jo,
        joDisplay: change.joDisplay,
        revisionType: change.revisionType,
        oldText: oldNew?.oldText,
        newText: oldNew?.newText,
        downstreamCount: downstream.length,
      }
    })

    const BATCH_SIZE = 10
    const classificationResults: Map<string, { severity: ImpactSeverity; reason: string }> = new Map()

    for (let i = 0; i < classificationInputs.length; i += BATCH_SIZE) {
      if (options?.signal?.aborted) throw new Error('cancelled')

      const batch = classificationInputs.slice(i, i + BATCH_SIZE)
      const results = await classifyImpact(batch, {
        signal: options?.signal,
        apiKey: options?.apiKey,
      })

      for (const r of results) {
        classificationResults.set(r.jo, { severity: r.severity, reason: r.reason })
      }

      yield {
        type: 'status',
        message: `AI 분류 중... (${Math.min(i + BATCH_SIZE, classificationInputs.length)}/${classificationInputs.length})`,
        progress: 65 + ((i + BATCH_SIZE) / classificationInputs.length) * 20,
        step: 'classifying',
      }
    }

    // ImpactItem 조립 + 점진적 전송
    const items: ImpactItem[] = []
    for (const change of allChanges) {
      const key = `${change.lawId}:${change.joDisplay}`
      const oldNew = allOldNewMap.get(key)
      const downstream = allDownstreamMap.get(key) || []
      const classification = classificationResults.get(change.jo)

      const item: ImpactItem = {
        id: `${change.lawId}-${change.jo}-${Date.now()}`,
        change,
        downstreamImpacts: downstream,
        severity: classification?.severity ?? inferSeverity(change, downstream.length),
        severityReason: classification?.reason ?? '자동 분류 (AI 미응답)',
        oldText: oldNew?.oldText,
        newText: oldNew?.newText,
      }

      items.push(item)
      yield { type: 'impact_item', item }
    }

    // ── Step 5: AI 종합 요약 (summarizing) ──
    yield { type: 'status', message: 'AI 종합 요약 생성 중...', progress: 88, step: 'summarizing' }

    const aiSummary = await generateImpactSummary(
      items,
      { from: dateFrom, to: dateTo },
      { signal: options?.signal, apiKey: options?.apiKey },
    )

    const summary: ImpactSummary = {
      totalChanges: items.length,
      bySeverity: {
        critical: items.filter(i => i.severity === 'critical').length,
        review: items.filter(i => i.severity === 'review').length,
        info: items.filter(i => i.severity === 'info').length,
      },
      byLaw: items.reduce((acc, i) => {
        acc[i.change.lawName] = (acc[i.change.lawName] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      aiSummary,
      dateRange: { from: dateFrom, to: dateTo },
    }

    yield { type: 'summary', summary }

    // ── Step 6: 완료 ──
    yield {
      type: 'complete',
      result: {
        items,
        summary,
        analyzedAt: new Date().toISOString(),
      },
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'cancelled') {
      yield { type: 'error', message: '분석이 취소되었습니다.', recoverable: false }
      return
    }
    const message = error instanceof Error ? error.message : '알 수 없는 오류'
    yield { type: 'error', message: `분석 중 오류: ${message}`, recoverable: false }
  }
}

// ── 유틸 ──

/** compare_old_new 텍스트에서 신법 공포일 추출 */
function extractDateFromCompare(text: string): string {
  const m = text.match(/신법 공포일:\s*(\S+)/)
  return m?.[1] ?? new Date().toISOString().slice(0, 10)
}

/** AI 미응답 시 규칙 기반 폴백 분류 */
function inferSeverity(change: ArticleChange, downstreamCount: number): ImpactSeverity {
  if (change.revisionType === '전부개정' || downstreamCount >= 3) return 'critical'
  if (change.revisionType === '삭제' || change.revisionType === '신설') return 'review'
  return 'info'
}

function buildEmptySummary(from: string, to: string): ImpactSummary {
  return {
    totalChanges: 0,
    bySeverity: { critical: 0, review: 0, info: 0 },
    byLaw: {},
    aiSummary: '조회 기간 내 변경사항이 없습니다.',
    dateRange: { from, to },
  }
}
