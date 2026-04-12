import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"
import { normalizeLawSearchText, resolveLawAlias } from "@/lib/search-normalizer"
import { validate, searchQuerySchema, createErrorResponse } from "@/lib/api-validation"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do"
const OC = process.env.LAW_OC || ""

/**
 * 정확히 일치하는 법령명이 있는지 확인 (CDATA 처리 포함)
 */
function hasExactLawMatch(xmlText: string, query: string): boolean {
  const normalizedQuery = query.replace(/\s+/g, '').replace(/"/g, '')
  // CDATA 내부의 법령명 추출: <![CDATA[상법]]> 또는 일반 텍스트
  const lawNameRegex = /<법령명한글>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/법령명한글>/g
  let match
  while ((match = lawNameRegex.exec(xmlText)) !== null) {
    const lawName = match[1].replace(/\s+/g, '')
    if (lawName === normalizedQuery) {
      return true
    }
  }
  return false
}

/**
 * 여러 XML 응답을 병합
 */
function mergeXmlResponses(responses: string[]): string {
  if (responses.length === 0) return ''
  if (responses.length === 1) return responses[0]

  // 첫 번째 응답에서 헤더 추출 (LawSearch 태그까지)
  const first = responses[0]
  const headerMatch = first.match(/^[\s\S]*?<LawSearch>/)
  const header = headerMatch ? headerMatch[0] : '<?xml version="1.0" encoding="UTF-8"?><LawSearch>'

  // 모든 응답에서 <law ...>...</law> 요소들 추출
  const allLaws: string[] = []
  for (const xml of responses) {
    const lawMatches = xml.match(/<law\s[^>]*>[\s\S]*?<\/law>/g)
    if (lawMatches) {
      allLaws.push(...lawMatches)
    }
  }

  // 메타데이터 추출 (첫 번째 응답에서)
  const targetMatch = first.match(/<target>([^<]*)<\/target>/)
  const keywordMatch = first.match(/<키워드>([^<]*)<\/키워드>/)
  const totalMatch = first.match(/<totalCnt>(\d+)<\/totalCnt>/)

  return `<?xml version="1.0" encoding="UTF-8"?><LawSearch>
<target>${targetMatch?.[1] || 'law'}</target>
<키워드>${keywordMatch?.[1] || ''}</키워드>
<totalCnt>${totalMatch?.[1] || allLaws.length}</totalCnt>
${allLaws.join('\n')}
</LawSearch>`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawQuery = searchParams.get("query")

  if (!rawQuery) {
    return createErrorResponse("검색어가 필요합니다", 400)
  }

  const queryValidation = validate(searchQuerySchema, rawQuery)
  if (!queryValidation.success) {
    return createErrorResponse(queryValidation.error, 400)
  }

  const normalizedQuery = normalizeLawSearchText(queryValidation.data)
  const aliasResolution = resolveLawAlias(normalizedQuery)
  const query = aliasResolution.canonical

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  try {
    // 짧은 검색어(3글자 이하)는 정확한 매칭 검색을 먼저 시도
    const isShortQuery = query.replace(/\s+/g, '').length <= 3

    if (isShortQuery) {
      // 1단계: 큰따옴표로 감싸서 정확한 매칭 검색
      const exactParams = new URLSearchParams({
        OC,
        type: "XML",
        target: "law",
        query: `"${query}"`,
      })

      const exactUrl = `${LAW_API_BASE}?${exactParams.toString()}`
      debugLogger.info("정확한 매칭 검색 시도 (짧은 검색어)", {
        query,
        exactQuery: `"${query}"`,
        url: exactUrl,
      })

      // API-5: Next data cache 비활성 (URL에 OC 포함되어 디스크 덤프 시 키 노출 우려)
      // 응답 헤더의 Cache-Control로만 캐싱 — Vercel/CF Edge가 해당 헤더 따라 처리
      const exactResponse = await fetchWithTimeout(exactUrl, { cache: "no-store" })

      if (exactResponse.ok) {
        const exactText = await exactResponse.text()

        // 정확한 매칭이 있는지 확인
        if (hasExactLawMatch(exactText, query)) {
          debugLogger.success("정확한 매칭 검색 성공", { query })

          return new NextResponse(exactText, {
            headers: {
              "Content-Type": "application/xml",
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          })
        }
      }

      // 2단계: 일반 검색으로 여러 페이지 검색
      debugLogger.info("정확한 매칭 검색 실패, 일반 검색으로 폴백", { query })

      const responses: string[] = []
      let foundExactMatch = false

      // 첫 페이지 검색
      const firstParams = new URLSearchParams({
        OC,
        type: "XML",
        target: "law",
        query,
      })

      const firstUrl = `${LAW_API_BASE}?${firstParams.toString()}`
      const firstResponse = await fetchWithTimeout(firstUrl, { cache: "no-store" })

      if (!firstResponse.ok) {
        throw new Error(`API 응답 오류: ${firstResponse.status}`)
      }

      const firstText = await firstResponse.text()
      responses.push(firstText)

      // totalCnt 추출
      const totalMatch = firstText.match(/<totalCnt>(\d+)<\/totalCnt>/)
      const totalCnt = totalMatch ? parseInt(totalMatch[1], 10) : 0

      foundExactMatch = hasExactLawMatch(firstText, query)
      debugLogger.info("첫 페이지 검색 결과", { totalCnt, foundExactMatch, query })

      // 정확한 매칭 없으면 추가 페이지 검색 (최대 3페이지)
      if (!foundExactMatch && totalCnt > 20) {
        const maxPage = Math.min(Math.ceil(totalCnt / 20), 3)

        for (let page = 2; page <= maxPage; page++) {
          const pageParams = new URLSearchParams({
            OC,
            type: "XML",
            target: "law",
            query,
            page: String(page),
          })

          const pageUrl = `${LAW_API_BASE}?${pageParams.toString()}`
          const pageResponse = await fetchWithTimeout(pageUrl, { cache: "no-store" })

          if (!pageResponse.ok) continue

          const pageText = await pageResponse.text()
          responses.push(pageText)

          if (hasExactLawMatch(pageText, query)) {
            foundExactMatch = true
            debugLogger.success("정확한 매칭 발견", { page, query })
            break
          }
        }
      }

      // 응답 병합
      const mergedXml = responses.length > 1 ? mergeXmlResponses(responses) : firstText

      debugLogger.success("법령 검색 완료 (짧은 검색어)", {
        totalCnt,
        pagesSearched: responses.length,
        foundExactMatch,
        resultLength: mergedXml.length
      })

      return new NextResponse(mergedXml, {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      })
    }

    // 긴 검색어는 단일 페이지 검색
    const params = new URLSearchParams({
      OC,
      type: "XML",
      target: "law",
      query,
    })

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("법령 검색 API 호출", {
      query,
      rawQuery,
      normalizedQuery,
      aliasMatched: aliasResolution.matchedAlias,
      url,
    })

    const response = await fetchWithTimeout(url, { cache: "no-store" })

    if (!response.ok) {
      const text = await response.text()
      debugLogger.error("법령 검색 API 오류", { status: response.status, body: text.substring(0, 200) })
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    const text = await response.text()

    debugLogger.success("법령 검색 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    return safeErrorResponse(error, "법령 검색 실패")
  }
}
