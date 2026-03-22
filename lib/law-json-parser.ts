import type { LawArticle, LawData } from "./law-types"
import { convertArticleNumberToCode, flattenArrayContent, extractContentFromHangArray } from "./law-data-utils"
import { debugLogger } from "./debug-logger"

/**
 * Main parser: JSON 법령 데이터 → LawData
 */
export function parseLawJSON(jsonData: any): LawData {
  try {
    // API 에러 응답 체크 (eflaw가 { error: "..." } 반환하는 경우)
    if (jsonData?.error) {
      throw new Error(jsonData.error)
    }

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

    for (const unit of articleUnits) {
      if (unit.조문여부 !== "조문") continue

      const articleNum = unit.조문번호
      const branchNum = unit.조문가지번호
      const title = unit.조문제목 || ""

      const result = convertArticleNumberToCode(articleNum, branchNum)
      const code = result.code
      const display = result.display

      // CRITICAL: 본문 (조문내용) + 항/호 결합 로직
      let mainContent = ""  // 조문내용에서 추출
      let paraContent = ""  // 항/호에서 추출

      // STEP 1: 본문 추출 (조문내용에서)
      // 조문내용이 배열인 경우 [[...]] 형태로 올 수 있음 (예: 제7조의3 연가 당겨쓰기)
      let rawContentValue = unit.조문내용
      if (Array.isArray(rawContentValue)) {
        // 중첩 배열 평탄화 후 문자열만 결합 (<img> 태그 제외)
        const flatten = (arr: any[]): string[] => {
          const result: string[] = []
          for (const item of arr) {
            if (typeof item === "string") {
              // <img> 태그만 제외 (표 테두리는 유지)
              if (!item.startsWith("<img") && !item.startsWith("</img")) {
                result.push(item)
              }
            } else if (Array.isArray(item)) {
              result.push(...flatten(item))
            }
          }
          return result
        }
        rawContentValue = flatten(rawContentValue).join("\n")
      }

      if (rawContentValue && typeof rawContentValue === "string") {
        let rawContent = rawContentValue.trim()

        // 제목 패턴 매칭: 제X조(제목) 형식
        const headerMatch = rawContent.match(/^(제\d+조(?:의\d+)?\s*(?:\([^)]+\))?)[\s\S]*/)

        if (headerMatch) {
          const headerPart = headerMatch[1]  // 제X조(제목)
          const bodyPart = rawContent.substring(headerPart.length).trim()  // 나머지 본문

          if (bodyPart) {
            // 본문이 있으면 본문만 저장
            mainContent = bodyPart
          } else {
            // 본문 없이 제목만 있는 경우 (도로법 시행령 55조)
            // 제목 제거하지 않고 유지 (호가 있을 수 있음)
            mainContent = headerPart
          }
        } else {
          // 제목 형식이 아니면 전체를 본문으로
          mainContent = rawContent
        }
      }

      // STEP 2: 항/호 내용 추출
      if (unit.항 && Array.isArray(unit.항)) {
        paraContent = extractContentFromHangArray(unit.항)
      }
      // Fallback: if 항 is an object with 호 array (old structure)
      else if (unit.항 && typeof unit.항 === "object" && unit.항.호) {
        if (Array.isArray(unit.항.호)) {
          for (const ho of unit.항.호) {
            if (ho.호내용) {
              const hoContent = flattenArrayContent(ho.호내용)
              paraContent += "\n" + hoContent
            }
          }
        }
      }

      // STEP 3: 본문 + 항/호 결합
      let content = ""
      if (mainContent) {
        content = mainContent
        if (paraContent) {
          content += "\n" + paraContent
        }
      } else {
        content = paraContent
      }

      articles.push({
        jo: code,
        joNum: display,
        title: title,
        content: content.trim(),
        isPreamble: false,
      })
    }

    return {
      meta,
      articles,
      articleCount: articles.length,
    }
  } catch (error) {
    debugLogger.error("JSON 파싱 오류", error)
    throw error
  }
}
