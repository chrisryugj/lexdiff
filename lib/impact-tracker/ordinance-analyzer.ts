/**
 * 조례↔상위법령 양방향 분석기
 *
 * B방향: 조례 본문에서 상위법령 참조 추출 → 변경 여부 확인
 * A방향: 상위법령 변경 시 영향받는 조례 탐색
 */

import { LawApiClient } from 'korean-law-mcp/build/lib/api-client.js'

// ── 타입 ──

export interface OrdinanceArticle {
  jo: string          // "제1조"
  title: string       // "(목적)"
  content: string     // HTML 제거된 본문
}

export interface ParentLawRef {
  parentLawName: string      // "건축법"
  parentJo?: string          // "제22조" (없으면 법령 전체 참조)
  ordinanceJo: string        // "제5조" (참조하는 조례 조문)
  ordinanceJoTitle?: string  // "(건축허가의 제한)"
}

export interface AffectedOrdinance {
  ordinanceName: string
  ordinanceId: string
  localGov: string           // "서울특별시 광진구"
  affectedArticles: Array<{
    ordinanceJo: string
    ordinanceJoTitle?: string
    referencedParentJo: string
  }>
}

// ── API 클라이언트 ──

const LAW_OC = process.env.LAW_OC
const apiClient = new LawApiClient({ apiKey: LAW_OC || '' })

// ── B방향: 조례 전문 조회 (전체 조문) ──

/**
 * apiClient.getOrdinance() 직접 호출하여 전체 조문 반환
 * (get_ordinance 도구는 10개 제한이므로 우회)
 */
export async function getFullOrdinanceArticles(
  ordinSeq: string,
): Promise<{ name: string; localGov: string; articles: OrdinanceArticle[] }> {
  const jsonText = await apiClient.getOrdinance(ordinSeq)
  const json = JSON.parse(jsonText)
  const lawService = json?.LawService

  if (!lawService) {
    throw new Error(`조례 데이터를 찾을 수 없습니다 (ordinSeq: ${ordinSeq})`)
  }

  const info = lawService.자치법규기본정보 || {}
  const rawArticles = lawService.조문?.조 || []
  const arr = Array.isArray(rawArticles) ? rawArticles : [rawArticles]

  const articles: OrdinanceArticle[] = arr.map((a: Record<string, string>) => {
    const content = stripHtml(a.조내용 || '')
    // 조번호 우선순위: 조번호 필드 → 조내용 첫 줄에서 추출 → 조제목에서 추출
    const jo = a.조번호
      || content.match(/^(제\d+조(?:의\d+)?)/)?.[1]
      || a.조제목?.match(/(제\d+조(?:의\d+)?)/)?.[1]
      || ''
    const title = a.조제목 || content.match(/^제\d+조(?:의\d+)?\(([^)]+)\)/)?.[0] || ''
    return { jo, title, content }
  })

  return {
    name: info.자치법규명 || '',
    localGov: info.지자체기관명 || '',
    articles,
  }
}

// ── B방향: 상위법령 참조 추출 ──

/**
 * 조례 조문에서 상위법령 참조를 추출
 *
 * 패턴:
 *  - 「건축법」 제22조
 *  - 건축법 제22조에 따라
 *  - 같은 법 제5조 / 법 제5조
 *  - 「국토의 계획 및 이용에 관한 법률」(이하 "국토계획법")
 */
export function extractLawReferences(
  articles: OrdinanceArticle[],
): Map<string, ParentLawRef[]> {
  const result = new Map<string, ParentLawRef[]>()

  // 법령명 패턴: 「법령명」 또는 3글자 이상 한글+법/령/규칙
  const lawNamePattern = /(?:「([^」]+)」|([가-힣]{2,}(?:법|령|규칙)))\s*(?:제(\d+)조(?:의(\d+))?)?/g
  // "같은 법" 패턴
  const sameLawPattern = /(?:같은\s*법|동법|법)\s+제(\d+)조(?:의(\d+))?/g

  let lastLawName = ''

  for (const article of articles) {
    if (!article.content || !article.jo) continue

    const refs: ParentLawRef[] = []
    const seen = new Set<string>()

    // 1. 명시적 법령명 참조
    let m: RegExpExecArray | null
    lawNamePattern.lastIndex = 0
    while ((m = lawNamePattern.exec(article.content)) !== null) {
      const lawName = (m[1] || m[2]).trim()

      // 자기 자신(조례) 참조 무시 + 너무 짧은 매치 무시
      if (lawName.length < 2) continue
      if (isNotLawName(lawName)) continue

      const joNum = m[3]
      const joSub = m[4]
      const parentJo = joNum
        ? `제${joNum}조${joSub ? `의${joSub}` : ''}`
        : undefined

      lastLawName = lawName

      const key = `${lawName}:${parentJo || '*'}`
      if (seen.has(key)) continue
      seen.add(key)

      refs.push({
        parentLawName: lawName,
        parentJo,
        ordinanceJo: article.jo,
        ordinanceJoTitle: article.title,
      })
    }

    // 2. "같은 법 제N조" 참조 (직전 법령명 상속)
    if (lastLawName) {
      sameLawPattern.lastIndex = 0
      while ((m = sameLawPattern.exec(article.content)) !== null) {
        const parentJo = `제${m[1]}조${m[2] ? `의${m[2]}` : ''}`
        const key = `${lastLawName}:${parentJo}`
        if (seen.has(key)) continue
        seen.add(key)

        refs.push({
          parentLawName: lastLawName,
          parentJo,
          ordinanceJo: article.jo,
          ordinanceJoTitle: article.title,
        })
      }
    }

    if (refs.length > 0) {
      for (const ref of refs) {
        const arr = result.get(ref.parentLawName) || []
        arr.push(ref)
        result.set(ref.parentLawName, arr)
      }
    }
  }

  return result
}

/**
 * 참조 맵을 상위법령별로 그룹화하여 요약
 */
export function summarizeReferences(
  refMap: Map<string, ParentLawRef[]>,
): Array<{ lawName: string; refCount: number; articles: string[] }> {
  return Array.from(refMap.entries()).map(([lawName, refs]) => ({
    lawName,
    refCount: refs.length,
    articles: [...new Set(refs.map(r => r.ordinanceJo))],
  }))
}

// ── A방향: 상위법령 변경 → 영향받는 조례 탐색 ──

/**
 * 상위법령의 변경된 조문을 참조하는 조례를 탐색
 *
 * @param lawName - 상위법령명 (e.g., "건축법")
 * @param changedJoDisplays - 변경된 조문 목록 (e.g., ["제11조", "제22조"])
 * @param region - 지역 필터 (e.g., "광진구") — 없으면 전체
 */
export async function findAffectedOrdinances(
  lawName: string,
  changedJoDisplays: string[],
  options?: { region?: string; maxResults?: number; signal?: AbortSignal },
): Promise<AffectedOrdinance[]> {
  const max = options?.maxResults ?? 5
  const query = options?.region ? `${options.region} ${lawName}` : lawName

  // 관련 조례 검색 (lazy import로 순환 참조 방지)
  const { executeTool } = await import('@/lib/fc-rag/tool-adapter')
  const searchResult = await executeTool('search_ordinance', { query })
  if (searchResult.isError) return []

  // 조례 목록 파싱 (parseOrdinanceSearchResult와 동일 패턴)
  const ordinances: Array<{ id: string; name: string; localGov: string }> = []
  const regex = /\[(\d+)\]\s+(.+?)(?:\n\s+지자체:\s*(.+))?(?:\n|$)/g
  let om: RegExpExecArray | null
  while ((om = regex.exec(searchResult.result)) !== null) {
    ordinances.push({
      id: om[1],
      name: om[2].trim(),
      localGov: om[3]?.trim() || '',
    })
    if (ordinances.length >= max) break
  }

  const results: AffectedOrdinance[] = []
  const changedSet = new Set(changedJoDisplays)

  for (const ordin of ordinances) {
    if (options?.signal?.aborted) break

    try {
      const { articles } = await getFullOrdinanceArticles(ordin.id)
      const refMap = extractLawReferences(articles)
      const refs = refMap.get(lawName) || []

      // 변경된 조문을 참조하는 것만 필터
      const affected = refs.filter(r => {
        if (!r.parentJo) return true // 법령 전체 참조 → 항상 영향
        return changedSet.has(r.parentJo)
      })

      if (affected.length > 0) {
        results.push({
          ordinanceName: ordin.name,
          ordinanceId: ordin.id,
          localGov: ordin.localGov,
          affectedArticles: affected.map(a => ({
            ordinanceJo: a.ordinanceJo,
            ordinanceJoTitle: a.ordinanceJoTitle,
            referencedParentJo: a.parentJo || '(전체)',
          })),
        })
      }
    } catch {
      // 개별 조례 조회 실패 → 스킵
      continue
    }
  }

  return results
}

// ── 유틸 ──

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 법령명이 아닌 일반 키워드 필터 */
function isNotLawName(name: string): boolean {
  // 조례/규칙 자체 참조
  if (/조례|^이\s|^본\s|^동\s/.test(name)) return true
  // 법종류 (법령명이 아님)
  if (/^(대통령령|총리령|부령|시행령|시행규칙|행정안전부령|국토교통부령|보건복지부령|환경부령|기획재정부령)$/.test(name)) return true
  // 너무 짧은 일반 명사
  if (name.length <= 2 && !/법$|령$/.test(name)) return true
  return false
}
