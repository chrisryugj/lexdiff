/**
 * C3: 서버/클라이언트 공통 XML 파서.
 * 기존 DOMParser는 Node 런타임에 없어 SSR/route handler에서 ReferenceError.
 * fast-xml-parser 기반으로 양쪽 런타임 모두 동작하도록 재작성.
 */
import { debugLogger } from "./debug-logger"
import type { RevisionHistoryItem } from "./law-types"
import { parseLawXml, extractText, asArray, isHtmlErrorPage } from "./xml-parser-helper"

export interface RevisionInfo {
  promulgationDate: string
  promulgationNumber: string
  revisionType: string
  effectiveDate?: string
  lawName: string
}

interface RawArticleHistoryRoot {
  // 법제처 XML 응답의 최상위는 가변 — law 리스트가 임의 위치에 존재 가능.
  [key: string]: unknown
}

function findLawNodes(root: unknown): Array<Record<string, unknown>> {
  if (!root || typeof root !== 'object') return []
  const r = root as Record<string, unknown>
  // 1) 최상위 `law` 직접
  if (r.law) return asArray(r.law) as Array<Record<string, unknown>>
  // 2) 최상위 래퍼(LawSearch / 법령 등) 내부 `law`
  for (const v of Object.values(r)) {
    if (v && typeof v === 'object') {
      const inner = (v as Record<string, unknown>).law
      if (inner) return asArray(inner) as Array<Record<string, unknown>>
    }
  }
  return []
}

export function parseArticleHistoryXML(xmlText: string): RevisionHistoryItem[] {
  try {
    if (isHtmlErrorPage(xmlText)) return []
    const root = parseLawXml<RawArticleHistoryRoot>(xmlText)
    const lawNodes = findLawNodes(root)
    if (lawNodes.length === 0) return []

    const history: RevisionHistoryItem[] = []

    for (const law of lawNodes) {
      const lawInfo = law['법령정보'] as Record<string, unknown> | undefined
      if (!lawInfo) continue

      const promulgationDate = extractText(lawInfo['공포일자'])
      const revisionType = extractText(lawInfo['제개정구분명'])

      const articleInfo = law['조문정보'] as Record<string, unknown> | undefined
      const changeReason = extractText(articleInfo?.['변경사유'])
      const articleLinkRaw = extractText(articleInfo?.['조문링크'])
      const articleLink = articleLinkRaw ? `https://www.law.go.kr${articleLinkRaw}` : undefined

      if (!promulgationDate) continue

      history.push({
        date: formatDate(promulgationDate),
        type: changeReason || revisionType || "개정",
        description: revisionType,
        articleLink,
      })
    }

    return history
  } catch (error) {
    debugLogger.error("조문 개정이력 파싱 실패", error)
    return []
  }
}

// 법제처 응답에서 law/연혁 노드의 필드명이 스키마마다 다름 → alias 매핑 테이블.
const FIELD_ALIASES: Record<keyof RevisionInfo, string[]> = {
  promulgationDate: ['공포일자', '공포일', 'PromulgationDate', '공포년월일', '공포날짜'],
  promulgationNumber: ['공포번호', '공포번', 'PromulgationNumber', '공포호'],
  revisionType: ['제개정구분', '제개정구분명', '제개정', 'RevisionType', '개정구분', '개정종류', '개정타입'],
  effectiveDate: ['시행일자', '시행일', 'EffectiveDate', '시행년월일', '시행날짜'],
  lawName: ['법령명_한글', '법령명한글', '법령명', 'LawName', '법령이름'],
}

function pickField(node: Record<string, unknown>, aliases: string[]): string {
  for (const key of aliases) {
    const v = extractText(node[key])
    if (v) return v
  }
  return ''
}

function findAllLawLikeNodes(root: unknown): Array<Record<string, unknown>> {
  // 최상위 law 노드 우선, 없으면 재귀 탐색
  const direct = findLawNodes(root)
  if (direct.length > 0) return direct
  const collected: Array<Record<string, unknown>> = []
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return }
    const obj = v as Record<string, unknown>
    // 연혁/revision 노드로 추정되는 키를 가진 객체는 후보
    if (obj['공포일자'] || obj['공포일'] || obj['PromulgationDate']) {
      collected.push(obj)
      return
    }
    for (const child of Object.values(obj)) visit(child, depth + 1)
  }
  visit(root, 0)
  return collected
}

export function parseRevisionHistoryXML(xmlText: string): RevisionInfo[] {
  try {
    if (isHtmlErrorPage(xmlText)) return []
    const root = parseLawXml<unknown>(xmlText)
    const nodes = findAllLawLikeNodes(root)
    if (nodes.length === 0) return []

    const revisions: RevisionInfo[] = []
    for (const node of nodes) {
      const promulgationDate = pickField(node, FIELD_ALIASES.promulgationDate)
      const promulgationNumber = pickField(node, FIELD_ALIASES.promulgationNumber)
      if (!promulgationDate && !promulgationNumber) continue
      revisions.push({
        promulgationDate: promulgationDate || "날짜미상",
        promulgationNumber: promulgationNumber || "번호미상",
        revisionType: pickField(node, FIELD_ALIASES.revisionType) || "개정",
        effectiveDate: pickField(node, FIELD_ALIASES.effectiveDate),
        lawName: pickField(node, FIELD_ALIASES.lawName),
      })
    }
    return revisions
  } catch (error) {
    debugLogger.error("개정이력 파싱 실패", error)
    return []
  }
}

import { formatDate as _formatDate } from './law-data-utils'

/** @deprecated Use formatDate from law-data-utils directly */
export function formatDate(dateStr: string): string {
  return _formatDate(dateStr, 'dash')
}

export function extractArticleRevisions(
  revisions: Array<{ date: string; type: string }> | undefined,
): RevisionHistoryItem[] {
  if (!revisions || revisions.length === 0) return []

  return revisions.map((rev) => ({
    date: rev.date,
    type: rev.type,
    description: undefined,
  }))
}
