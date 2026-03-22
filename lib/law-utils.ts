/**
 * law-utils.ts
 *
 * 법령 데이터 처리 유틸리티 함수
 * - page.tsx에서 분리한 공통 함수들
 */

import { debugLogger } from "@/lib/debug-logger"
import { convertArticleNumberToCode, extractContentFromHangArray } from "@/lib/law-data-utils"
import type { LawData, LawMeta, LawArticle } from "@/lib/law-types"

export { convertArticleNumberToCode, extractContentFromHangArray }

/**
 * JSON 데이터를 LawData로 파싱
 */
export function parseLawJSON(jsonData: any): LawData {

  try {
    const lawData = jsonData.법령

    if (!lawData) {
      throw new Error("법령 데이터가 없습니다")
    }

    const basicInfo = lawData.기본정보 || lawData
    const meta = {
      lawId: basicInfo.법령ID || basicInfo.법령키 || "unknown",
      lawTitle: basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || "제목 없음",
      latestEffectiveDate: basicInfo.최종시행일자 || basicInfo.시행일자 || "",
      promulgation: {
        date: basicInfo.공포일자 || "",
        number: basicInfo.공포번호 || "",
      },
      revisionType: basicInfo.제개정구분명 || basicInfo.제개정구분 || "",
      fetchedAt: new Date().toISOString(),
    }


    const articles: LawArticle[] = []
    const articleUnits = lawData.조문?.조문단위 || []

    debugLogger.info("전체 조문 단위: " + articleUnits.length + "개")

    for (let i = 0; i < articleUnits.length; i++) {
      const unit = articleUnits[i]

      if (unit.조문여부 !== "조문") {
        continue
      }

      const articleNum = unit.조문번호
      const branchNum = unit.조문가지번호
      const title = unit.조문제목 || ""

      const result = convertArticleNumberToCode(articleNum, branchNum)
      const code = result.code
      const display = result.display

      let content = ""

      if (unit.항 && Array.isArray(unit.항)) {
        content = extractContentFromHangArray(unit.항)
      }
      // Fallback: if 항 is an object with 호 array (old structure)
      else if (unit.항 && typeof unit.항 === "object" && unit.항.호) {
        if (Array.isArray(unit.항.호)) {
          for (const ho of unit.항.호) {
            if (ho.호내용) {
              let hoContent = ho.호내용
              if (Array.isArray(hoContent)) {
                hoContent = hoContent.join("\n")
              }
              content += "\n" + hoContent
            }
          }
        }
      } else if (unit.조문내용 && typeof unit.조문내용 === "string") {
        let rawContent = unit.조문내용.trim()

        // Remove the article header (e.g., "제28조(개별소비세의 사무 관할)")
        // Pattern: 제N조(제목) or 제N조의M(제목)
        const headerPattern = /^제\d+조(?:의\d+)?\([^)]+\)\s*/
        rawContent = rawContent.replace(headerPattern, "")

        content = rawContent
      }

      articles.push({
        jo: code,
        joNum: display,
        title: title,
        content: content.trim(),
        isPreamble: false,
      })
    }


    // Debug: Show JO code range
    if (articles.length > 0) {
      debugLogger.debug(`   JO 코드 범위: ${articles[0]?.jo} (${articles[0]?.joNum}) ~ ${articles[articles.length - 1]?.jo} (${articles[articles.length - 1]?.joNum})`)

      // Show all "조의" articles
      const branchArticles = articles.filter(a => {
        const branchNum = parseInt(a.jo.slice(-2))
        return branchNum > 0
      })
      if (branchArticles.length > 0) {
        debugLogger.debug(`   조의 조문 ${branchArticles.length}개: ${branchArticles.map(a => `${a.jo}(${a.joNum})`).join(', ')}`)
      }
    }

    return {
      meta: meta,
      articles: articles,
      articleCount: articles.length,
    }
  } catch (error) {
    debugLogger.error("JSON 파싱 오류", error)
    throw error
  }
}
