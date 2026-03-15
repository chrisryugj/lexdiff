/**
 * 법령 영향 추적기 엔진 - AsyncGenerator + SSE 패턴
 *
 * 양방향 파이프라인:
 *
 * [국가법령 입력] (기존 A방향)
 *   1. resolving  — search_law로 MST 확보
 *   2. comparing  — compare_old_new로 변경 조문 + 신구문
 *   3. tracing    — get_three_tier + 조례 영향 탐색
 *
 * [조례 입력] (B방향)
 *   1. resolving  — search_ordinance로 ordinSeq 확보
 *   2. extracting — 조례 전문에서 상위법령 참조 추출
 *   3. comparing  — 참조된 상위법령의 변경 여부 확인
 *
 * [공통]
 *   4. classifying — AI 영향도 분류
 *   5. summarizing — AI 종합 요약
 *   6. complete   — 최종 결과 조립
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
import {
  getFullOrdinanceArticles,
  extractLawReferences,
  summarizeReferences,
  findAffectedOrdinances,
} from './ordinance-analyzer'
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
  const { lawNames, dateFrom, dateTo, mode = 'impact' } = request
  const isOrdinanceSyncMode = mode === 'ordinance-sync'
  const allChanges: ArticleChange[] = []
  const allOldNew: Array<{ oldText: string; newText: string }> = []
  const allDownstreamMap = new Map<string, DownstreamImpact[]>()
  const resolvedLaws: ResolvedLaw[] = []
  // B방향: 조례별 상위법령 참조 매핑 (classification에서 사용)
  const ordinanceRefContext = new Map<string, { ordinanceName: string; ordinanceArticles: string[] }>()

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
        yield { type: 'error', message: `"${lawName}" 검색 결과가 없습니다.`, recoverable: true }
        continue
      }

      // 정확한 이름 매칭 우선 (사용자가 자동완성에서 선택한 경우)
      const exactMatch = parsed.find(p => p.lawName === lawName)
      const law = exactMatch || parsed[0]
      resolvedLaws.push(law)
      yield { type: 'law_resolved', lawName: law.lawName, lawId: law.lawId, mst: law.mst }
    }

    if (resolvedLaws.length === 0) {
      yield { type: 'error', message: '검색된 법령이 없습니다.', recoverable: false }
      return
    }

    // 조례 / 국가법령 분리
    const ordinances = resolvedLaws.filter(l => l.kind === '조례')
    const nationalLaws = resolvedLaws.filter(l => l.kind !== '조례')

    // ── B방향: 조례 → 상위법령 참조 추출 + 변경 확인 ──
    if (ordinances.length > 0) {
      yield* processOrdinances(ordinances, dateFrom, dateTo, allChanges, allOldNew, ordinanceRefContext, options)
    }

    // ── A방향: 국가법령 신구법비교 + 위임법령 추적 ──
    if (nationalLaws.length > 0) {
      if (isOrdinanceSyncMode) {
        // ordinance-sync 모드: 국가법령은 B방향으로 전환
        // 해당 법을 참조하는 조례를 찾아서 미반영 체크
        yield* processNationalLawsAsSync(nationalLaws, dateFrom, dateTo, allChanges, allOldNew, allDownstreamMap, ordinanceRefContext, request, options)
      } else {
        yield* processNationalLaws(nationalLaws, allChanges, allOldNew, allDownstreamMap, request, options)
      }
    }

    // 중복 조문 제거 (같은 법령+조문이 A/B방향에서 중복 수집될 수 있음)
    const deduped = deduplicateChanges(allChanges, allOldNew)
    allChanges.length = 0
    allOldNew.length = 0
    allChanges.push(...deduped.changes)
    allOldNew.push(...deduped.oldNewPairs)

    if (allChanges.length === 0) {
      yield { type: 'status', message: '조회 기간 내 변경사항이 없습니다.', progress: 100, step: 'complete' }
      yield { type: 'complete', result: { items: [], summary: buildEmptySummary(dateFrom, dateTo), analyzedAt: new Date().toISOString() } }
      return
    }

    // ── Step 4: AI 영향도 분류 (classifying) ──
    yield { type: 'status', message: 'AI 영향도 분류 중...', progress: 65, step: 'classifying' }

    const aiSource = await getAISource()
    yield { type: 'ai_source', source: aiSource }

    const classificationInputs: ClassificationInput[] = allChanges.map((change, i) => {
      const key = `${change.lawId}:${change.joDisplay}`
      const oldNew = allOldNew[i]
      const downstream = allDownstreamMap.get(key) || []
      const ordRef = ordinanceRefContext.get(`${change.lawName}:${change.joDisplay}`)
      return {
        lawName: change.lawName,
        jo: change.jo,
        joDisplay: change.joDisplay,
        revisionType: change.revisionType,
        oldText: oldNew?.oldText,
        newText: oldNew?.newText,
        downstreamCount: downstream.length,
        referencingOrdinance: ordRef,
      }
    })

    const BATCH_SIZE = 10
    const classificationResults = new Map<string, { severity: ImpactSeverity; reason: string }>()

    for (let i = 0; i < classificationInputs.length; i += BATCH_SIZE) {
      if (options?.signal?.aborted) throw new Error('cancelled')

      const batch = classificationInputs.slice(i, i + BATCH_SIZE)
      const results = await classifyImpact(batch, { signal: options?.signal, apiKey: options?.apiKey })

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
    for (let idx = 0; idx < allChanges.length; idx++) {
      const change = allChanges[idx]
      const key = `${change.lawId}:${change.joDisplay}`
      const oldNew = allOldNew[idx]
      const downstream = allDownstreamMap.get(key) || []
      const classification = classificationResults.get(change.jo)

      const item: ImpactItem = {
        id: `${change.lawId}-${change.jo}-${idx}`,
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
    yield { type: 'complete', result: { items, summary, analyzedAt: new Date().toISOString() } }
  } catch (error) {
    if (error instanceof Error && error.message === 'cancelled') {
      yield { type: 'error', message: '분석이 취소되었습니다.', recoverable: false }
      return
    }
    const message = error instanceof Error ? error.message : '알 수 없는 오류'
    yield { type: 'error', message: `분석 중 오류: ${message}`, recoverable: false }
  }
}

// ── B방향: 조례 → 상위법령 변경 추적 ──

async function* processOrdinances(
  ordinances: ResolvedLaw[],
  dateFrom: string,
  dateTo: string,
  allChanges: ArticleChange[],
  allOldNew: Array<{ oldText: string; newText: string }>,
  ordinanceRefContext: Map<string, { ordinanceName: string; ordinanceArticles: string[] }>,
  options?: { signal?: AbortSignal },
): AsyncGenerator<ImpactSSEEvent> {
  for (const ordin of ordinances) {
    if (options?.signal?.aborted) throw new Error('cancelled')

    // 2-1. 조례 전문 조회 + 상위법령 참조 추출
    yield { type: 'status', message: `${ordin.lawName} 상위법령 참조 분석 중...`, progress: 12, step: 'extracting' }

    let refMap: Map<string, Array<{ parentLawName: string; parentJo?: string; ordinanceJo: string; ordinanceJoTitle?: string }>>
    try {
      const { articles } = await getFullOrdinanceArticles(ordin.lawId)
      refMap = extractLawReferences(articles)
    } catch {
      yield { type: 'error', message: `${ordin.lawName}: 조례 본문 조회 실패`, recoverable: true }
      continue
    }

    if (refMap.size === 0) {
      yield { type: 'error', message: `${ordin.lawName}: 상위법령 참조를 찾을 수 없습니다.`, recoverable: true }
      continue
    }

    const refSummary = summarizeReferences(refMap)
    yield { type: 'ordinance_refs', ordinanceName: ordin.lawName, refs: refSummary }

    // 2-2. 각 상위법령의 변경 여부 확인
    let parentIdx = 0
    for (const [parentLawName, refs] of refMap) {
      if (options?.signal?.aborted) throw new Error('cancelled')
      parentIdx++

      const progress = 15 + (parentIdx / refMap.size) * 30
      yield { type: 'status', message: `${parentLawName} 변경사항 확인 중...`, progress: Math.round(progress), step: 'comparing' }

      // 상위법령 검색
      const lawResult = await executeTool('search_law', { query: parentLawName })
      if (lawResult.isError) continue

      const parsed = parseSearchResult(lawResult.result)
      if (parsed.length === 0) continue

      const parentLaw = parsed[0]

      // 신구법 비교
      const compareResult = await executeTool('compare_old_new', { lawId: parentLaw.lawId, mst: parentLaw.mst })
      if (compareResult.isError) continue
      if (compareResult.result.includes('개정 이력이 없거나') || compareResult.result.includes('데이터가 없습니다')) continue

      const compParsed = parseCompareOldNew(compareResult.result)
      const revisionDate = extractDateFromCompare(compareResult.result)
      const changes = buildChangesFromOldNew(compParsed, parentLaw.lawId, parentLaw.mst, revisionDate)

      // 조례가 참조하는 조문만 필터
      const referencedJos = new Set(refs.filter(r => r.parentJo).map(r => r.parentJo!))
      const hasWildcard = refs.some(r => !r.parentJo) // 법령 전체 참조

      const relevantChanges = hasWildcard
        ? changes // 전체 참조면 모든 변경 포함
        : changes.filter(c => referencedJos.has(c.joDisplay))

      if (relevantChanges.length === 0) continue

      // ordinanceRefContext에 매핑 저장 (분류 시 사용)
      for (const change of relevantChanges) {
        const key = `${change.lawName}:${change.joDisplay}`
        const affectedOrdArticles = refs
          .filter(r => !r.parentJo || r.parentJo === change.joDisplay)
          .map(r => r.ordinanceJo)
        ordinanceRefContext.set(key, {
          ordinanceName: ordin.lawName,
          ordinanceArticles: [...new Set(affectedOrdArticles)],
        })
      }

      allChanges.push(...relevantChanges)

      // oldNew 텍스트도 매핑
      for (const pair of compParsed.pairs) {
        const isRelevant = hasWildcard || referencedJos.has(pair.joDisplay)
        if (isRelevant) {
          allOldNew.push({ oldText: pair.oldText, newText: pair.newText })
        }
      }

      const affectedOrdJos = [...new Set(refs.filter(r => !r.parentJo || referencedJos.has(r.parentJo || '')).map(r => r.ordinanceJo))]
      yield {
        type: 'parent_law_change',
        parentLaw: parentLawName,
        changedArticles: [...new Set(relevantChanges.map(c => c.joDisplay))],
        affectedOrdinanceArticles: affectedOrdJos,
      }
      yield { type: 'changes_found', lawName: parentLaw.lawName, changes: relevantChanges }
    }
  }
}

// ── A방향: 국가법령 신구법비교 + 위임법령/조례 추적 ──

async function* processNationalLaws(
  nationalLaws: ResolvedLaw[],
  allChanges: ArticleChange[],
  allOldNew: Array<{ oldText: string; newText: string }>,
  allDownstreamMap: Map<string, DownstreamImpact[]>,
  request: ImpactTrackerRequest,
  options?: { signal?: AbortSignal },
): AsyncGenerator<ImpactSSEEvent> {
  // Step 2: 신구법 비교
  yield { type: 'status', message: '신구법 비교 조회 중...', progress: 10, step: 'comparing' }

  for (let i = 0; i < nationalLaws.length; i++) {
    if (options?.signal?.aborted) throw new Error('cancelled')

    const law = nationalLaws[i]
    const progressPer = 10 + ((i + 1) / nationalLaws.length) * 25

    yield { type: 'status', message: `${law.lawName} 신구법 비교 중...`, progress: Math.round(progressPer), step: 'comparing' }

    const compareResult = await executeTool('compare_old_new', { lawId: law.lawId, mst: law.mst })

    if (compareResult.isError) {
      yield { type: 'error', message: `${law.lawName} 신구법 비교 실패: ${compareResult.result.slice(0, 100)}`, recoverable: true }
      continue
    }

    if (compareResult.result.includes('개정 이력이 없거나') || compareResult.result.includes('데이터가 없습니다')) {
      yield { type: 'error', message: `${law.lawName}: 신구법 대조 데이터가 없습니다.`, recoverable: true }
      continue
    }

    const parsed = parseCompareOldNew(compareResult.result)
    const revisionDate = extractDateFromCompare(compareResult.result)
    const changes = buildChangesFromOldNew(parsed, law.lawId, law.mst, revisionDate)

    allChanges.push(...changes)
    for (const pair of parsed.pairs) {
      allOldNew.push({ oldText: pair.oldText, newText: pair.newText })
    }

    yield { type: 'changes_found', lawName: law.lawName, changes }
  }

  // Step 3: 위임법령 추적 (three_tier)
  yield { type: 'status', message: '하위법령 영향 추적 중...', progress: 40, step: 'tracing' }

  for (let i = 0; i < nationalLaws.length; i++) {
    if (options?.signal?.aborted) throw new Error('cancelled')

    const law = nationalLaws[i]
    yield { type: 'status', message: `${law.lawName} 위임법령 조회 중...`, progress: Math.round(40 + ((i + 1) / nationalLaws.length) * 10), step: 'tracing' }

    const threeTierResult = await executeTool('get_three_tier', { lawId: law.lawId, mst: law.mst })
    if (!threeTierResult.isError) {
      const downstream = parseThreeTierResult(threeTierResult.result)
      for (const [joDisplay, impacts] of downstream) {
        const key = `${law.lawId}:${joDisplay}`
        allDownstreamMap.set(key, impacts)
      }
    }
  }

  // Step 3.5: 관련 조례 영향 탐색 (A방향 확장)
  const changedJoDisplays = [...new Set(allChanges.map(c => c.joDisplay))]
  if (changedJoDisplays.length > 0) {
    yield { type: 'status', message: '관련 자치법규 탐색 중...', progress: 55, step: 'tracing' }

    for (const law of nationalLaws) {
      if (options?.signal?.aborted) throw new Error('cancelled')

      try {
        const affected = await findAffectedOrdinances(
          law.lawName,
          changedJoDisplays,
          { region: request.region, maxResults: 3, signal: options?.signal },
        )

        for (const ord of affected) {
          for (const art of ord.affectedArticles) {
            // 해당 상위법령 조문의 downstream에 자치법규 추가
            const key = `${law.lawId}:${art.referencedParentJo}`
            const existing = allDownstreamMap.get(key) || []
            existing.push({
              type: '자치법규',
              lawName: ord.ordinanceName,
              lawId: ord.ordinanceId,
              joDisplay: art.ordinanceJo,
              content: art.ordinanceJoTitle,
            })
            allDownstreamMap.set(key, existing)
          }
        }
      } catch {
        // 조례 탐색 실패는 무시 (비핵심 기능)
      }
    }
  }
}

// ── ordinance-sync 모드: 국가법령 → 조례 미반영 탐지 ──

async function* processNationalLawsAsSync(
  nationalLaws: ResolvedLaw[],
  dateFrom: string,
  dateTo: string,
  allChanges: ArticleChange[],
  allOldNew: Array<{ oldText: string; newText: string }>,
  allDownstreamMap: Map<string, DownstreamImpact[]>,
  ordinanceRefContext: Map<string, { ordinanceName: string; ordinanceArticles: string[] }>,
  request: ImpactTrackerRequest,
  options?: { signal?: AbortSignal },
): AsyncGenerator<ImpactSSEEvent> {
  // Step 2: 신구법 비교 (변경 조문 파악)
  yield { type: 'status', message: '상위법 변경사항 확인 중...', progress: 10, step: 'comparing' }

  for (let i = 0; i < nationalLaws.length; i++) {
    if (options?.signal?.aborted) throw new Error('cancelled')

    const law = nationalLaws[i]
    yield { type: 'status', message: `${law.lawName} 신구법 비교 중...`, progress: Math.round(10 + ((i + 1) / nationalLaws.length) * 20), step: 'comparing' }

    const compareResult = await executeTool('compare_old_new', { lawId: law.lawId, mst: law.mst })
    if (compareResult.isError) continue
    if (compareResult.result.includes('개정 이력이 없거나') || compareResult.result.includes('데이터가 없습니다')) continue

    const parsed = parseCompareOldNew(compareResult.result)
    const revisionDate = extractDateFromCompare(compareResult.result)
    const changes = buildChangesFromOldNew(parsed, law.lawId, law.mst, revisionDate)

    allChanges.push(...changes)
    for (const pair of parsed.pairs) {
      allOldNew.push({ oldText: pair.oldText, newText: pair.newText })
    }

    yield { type: 'changes_found', lawName: law.lawName, changes }
  }

  // Step 3: 관련 조례 탐색 (미반영 후보)
  const changedJoDisplays = [...new Set(allChanges.map(c => c.joDisplay))]
  if (changedJoDisplays.length > 0) {
    yield { type: 'status', message: '관련 조례 미반영 탐색 중...', progress: 40, step: 'tracing' }

    for (const law of nationalLaws) {
      if (options?.signal?.aborted) throw new Error('cancelled')

      try {
        const affected = await findAffectedOrdinances(
          law.lawName,
          changedJoDisplays,
          { region: request.region, maxResults: 5, signal: options?.signal },
        )

        for (const ord of affected) {
          for (const art of ord.affectedArticles) {
            const key = `${law.lawId}:${art.referencedParentJo}`
            const existing = allDownstreamMap.get(key) || []
            existing.push({
              type: '자치법규',
              lawName: ord.ordinanceName,
              lawId: ord.ordinanceId,
              joDisplay: art.ordinanceJo,
              content: art.ordinanceJoTitle,
            })
            allDownstreamMap.set(key, existing)

            // ordinanceRefContext에 미반영 매핑
            ordinanceRefContext.set(`${law.lawName}:${art.referencedParentJo}`, {
              ordinanceName: ord.ordinanceName,
              ordinanceArticles: [art.ordinanceJo],
            })
          }
        }
      } catch {
        // 조례 탐색 실패 무시
      }
    }
  }
}

// ── 유틸 ──

function deduplicateChanges(
  changes: ArticleChange[],
  oldNewPairs: Array<{ oldText: string; newText: string }>,
): { changes: ArticleChange[]; oldNewPairs: Array<{ oldText: string; newText: string }> } {
  const seen = new Set<string>()
  const dedupedChanges: ArticleChange[] = []
  const dedupedOldNew: Array<{ oldText: string; newText: string }> = []

  for (let i = 0; i < changes.length; i++) {
    const key = `${changes[i].lawId}:${changes[i].joDisplay}`
    if (seen.has(key)) continue
    seen.add(key)
    dedupedChanges.push(changes[i])
    if (oldNewPairs[i]) dedupedOldNew.push(oldNewPairs[i])
  }

  return { changes: dedupedChanges, oldNewPairs: dedupedOldNew }
}

function extractDateFromCompare(text: string): string {
  const m = text.match(/신법 공포일:\s*(\S+)/)
  return m?.[1] ?? new Date().toISOString().slice(0, 10)
}

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
