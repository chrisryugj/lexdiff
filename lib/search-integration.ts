// 기존 page.tsx의 검색 로직과 intelligentSearch 통합

import { intelligentSearch } from './search-strategy'
import { debugLogger } from './debug-logger'

export async function tryIntelligentSearch(rawQuery: string): Promise<{
  success: boolean
  data?: any
  source?: string
  time?: number
}> {
  try {
    const result = await intelligentSearch(rawQuery)

    debugLogger.success(`검색 완료: ${result.source} (${result.time}ms)`)

    return {
      success: true,
      data: result.data,
      source: result.source,
      time: result.time,
    }
  } catch (error) {
    debugLogger.warning('Intelligent search 실패, 기존 로직으로 폴백', error)
    return {
      success: false,
    }
  }
}

// raw query 재구성
export function reconstructRawQuery(query: { lawName: string; article?: string; jo?: string }): string {
  const { lawName, article } = query
  if (article) {
    return `${lawName} ${article}`
  }
  return lawName
}